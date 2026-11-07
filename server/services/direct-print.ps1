# Direct Print Utility for Windows Spooler
param(
    [Parameter(Mandatory=$true)]
    [string]$Action, # 'list', 'print-raw', 'print-image'
    
    [Parameter(Mandatory=$false)]
    [string]$PrinterName,
    
    [Parameter(Mandatory=$false)]
    [string]$ContentBase64,
    
    [Parameter(Mandatory=$false)]
    [string]$ImagePath
)

$ErrorActionPreference = "Stop"

if ($Action -eq "list") {
    $printers = Get-CimInstance Win32_Printer | Select-Object Name, DriverName, PortName, Default, PrinterStatus
    $result = @{
        success = $true
        printers = @($printers | ForEach-Object {
            @{
                name = $_.Name
                driverName = $_.DriverName
                portName = $_.PortName
                isDefault = [bool]$_.Default
                isZebra = [bool]($_.Name -match "ZDesigner|Zebra|ZPL" -or $_.DriverName -match "ZDesigner|Zebra|ZPL")
            }
        })
    }
    $result | ConvertTo-Json -Depth 5 -Compress
    exit 0
}

# Compile RawPrinterHelper if printing raw
$rawPrinterCode = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, byte[] pBytes) {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Direct Print Label";
        di.pDataType = "RAW";
        bool bSuccess = false;
        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(pBytes.Length);
                    Marshal.Copy(pBytes, 0, pUnmanagedBytes, pBytes.Length);
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, pBytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
"@

if ($Action -eq "print-raw") {
    if (-not $PrinterName) {
        throw "PrinterName parameter is required for print-raw."
    }
    if (-not $ContentBase64) {
        throw "ContentBase64 parameter is required for print-raw."
    }

    Add-Type -TypeDefinition $rawPrinterCode -ErrorAction Stop

    $rawBytes = [System.Convert]::FromBase64String($ContentBase64)
    $ok = [RawPrinterHelper]::SendBytesToPrinter($PrinterName, $rawBytes)
    if (-not $ok) {
        $lastError = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "Failed to send raw data to printer '$PrinterName' (Win32 Error: $lastError)."
    }

    $result = @{
        success = $true
        message = "Label successfully sent to printer '$PrinterName'."
        bytesSent = $rawBytes.Length
    }
    $result | ConvertTo-Json -Depth 5 -Compress
    exit 0
}

if ($Action -eq "print-image") {
    if (-not $PrinterName) {
        throw "PrinterName parameter is required for print-image."
    }
    if (-not $ImagePath -or -not (Test-Path $ImagePath)) {
        throw "Valid ImagePath is required for print-image."
    }

    Add-Type -AssemblyName System.Drawing
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrinterSettings.PrinterName = $PrinterName
    if (-not $doc.PrinterSettings.IsValid) {
        throw "Printer '$PrinterName' is not valid or not installed."
    }

    $img = [System.Drawing.Image]::FromFile($ImagePath)
    $script:printImg = $img

    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    
    $doc.add_PrintPage({
        param($sender, $ev)
        $rect = $ev.MarginBounds
        if ($rect.Width -le 0 -or $rect.Height -le 0) {
            $rect = $ev.PageBounds
        }
        $ev.Graphics.DrawImage($script:printImg, $rect)
        $ev.HasMorePages = $false
    })

    try {
        $doc.Print()
    } finally {
        $img.Dispose()
    }

    $result = @{
        success = $true
        message = "Image successfully printed to '$PrinterName'."
    }
    $result | ConvertTo-Json -Depth 5 -Compress
    exit 0
}

throw "Unknown action: $Action"

