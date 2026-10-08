import { useState } from 'react'
import { SCAN_DATA } from '../data/dummyData.js'
import AppHeader from '../components/AppHeader.jsx'
import ScanIdle from '../components/ScanIdle.jsx'
import InfoCards from '../components/InfoCards.jsx'
import RollTable from '../components/RollTable.jsx'
import ScanModal from '../components/ScanModal.jsx'
import DefectModal from '../components/DefectModal.jsx'
import SendModal from '../components/SendModal.jsx'
import Toast from '../components/Toast.jsx'
import styles from './MainPage.module.css'

export default function MainPage({ user, onLogout }) {
  const [scanned, setScanned] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [rolls, setRolls] = useState(SCAN_DATA.rolls)
  const [defectModal, setDefectModal] = useState(null) // roll object | null
  const [defects, setDefects] = useState({}) // { rollId: [{id, yard, code}] }
  const [showSend, setShowSend] = useState(false)
  const [toastMsg, setToastMsg] = useState('')

  const totalDefects = Object.values(defects).reduce((sum, arr) => sum + arr.length, 0)

  function showToast(msg) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3000)
  }

  function handleSend() {
    setShowSend(false)
    showToast('Data berhasil dikirim!')
    setTimeout(() => {
      setScanned(false)
      setDefects({})
      setRolls(SCAN_DATA.rolls)
    }, 3500)
  }

  function handleGetData() {
    return new Promise(resolve => {
      setTimeout(() => {
        setRolls(prev => {
          const nextId = prev.length > 0 ? Math.max(...prev.map(r => r.id)) + 1 : 1
          const randomLength = +(Math.random() * (125 - 95) + 95).toFixed(1)
          const newRoll = { id: nextId, length: randomLength }
          showToast(`Roll #${nextId} (${randomLength} yard) berhasil ditarik dari mesin!`)
          return [...prev, newRoll]
        })
        resolve()
      }, 750)
    })
  }

  function handleDeleteRoll(rollId) {
    setRolls(prev => prev.filter(r => r.id !== rollId))
    setDefects(prev => {
      const next = { ...prev }
      delete next[rollId]
      return next
    })
    showToast(`Roll #${rollId} berhasil dihapus`)
  }

  function saveDefects(rollId, list) {
    setDefects(prev => ({ ...prev, [rollId]: list }))
    setDefectModal(null)
  }

  function handleResetScan() {
    setScanned(false)
    setDefects({})
    setRolls(SCAN_DATA.rolls)
  }

  return (
    <div className={styles.wrapper}>
      <AppHeader user={user} onLogout={onLogout} />

      <main className={styles.content}>
        {!scanned ? (
          <div className={styles.idleWrap}>
            <ScanIdle user={user} onScan={() => setShowScan(true)} />
          </div>
        ) : (
          <>
            <InfoCards
              data={SCAN_DATA}
              user={user}
              totalDefects={totalDefects}
              rollsCount={rolls.length}
            />

            <RollTable
              rolls={rolls}
              defects={defects}
              onCatatCacat={roll => setDefectModal(roll)}
              onGetData={handleGetData}
              onDeleteRoll={handleDeleteRoll}
            />

            <div className={styles.actionBar}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleResetScan}
              >
                ↩ Scan Ulang
              </button>
              <button
                type="button"
                className="btn btn-success"
                style={{ padding: '13px 36px', fontSize: '15px' }}
                onClick={() => setShowSend(true)}
              >
                📤 Send Data
              </button>
            </div>
          </>
        )}
      </main>

      {/* ── Modals ── */}
      {showScan && (
        <ScanModal
          onDone={() => {
            setShowScan(false)
            setScanned(true)
            setRolls(SCAN_DATA.rolls)
          }}
          onCancel={() => setShowScan(false)}
        />
      )}

      {defectModal && (
        <DefectModal
          roll={defectModal}
          initDefects={defects[defectModal.id]}
          onSave={list => saveDefects(defectModal.id, list)}
          onClose={() => setDefectModal(null)}
        />
      )}

      {showSend && (
        <SendModal
          data={{
            prodNumber: SCAN_DATA.prodNumber,
            seqmentNumber: SCAN_DATA.seqmentNum,
            operator: user.name,
            machine: user.machine,
            rolls,
            defects,
          }}
          onConfirm={handleSend}
          onClose={() => setShowSend(false)}
        />
      )}

      {toastMsg && <Toast message={toastMsg} />}
    </div>
  )
}
