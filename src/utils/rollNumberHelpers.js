/**
 * Kumpulkan seluruh nomor roll (atau co-product) yang sudah pernah dipakai
 * pada suatu OP, baik yang masih aktif maupun yang sudah di-soft-delete.
 *
 * @param {object} params
 * @param {Array} [params.rolls]
 * @param {Array} [params.existingDbRolls]
 * @param {Array<number>} [params.allDbRollNumbers]
 * @param {number} [params.productType]
 * @returns {Set<number>}
 */
export function collectUsedRollNumbers({
  rolls = [],
  existingDbRolls = [],
  allDbRollNumbers = [],
  productType = 5,
} = {}) {
  const used = new Set();

  for (const r of rolls || []) {
    const num = Number(r?.id ?? r?.RoolNumber ?? r?.roolNumber);
    if (num > 0) used.add(num);
  }

  for (const line of existingDbRolls || []) {
    if (Number(line?.ProductType ?? 5) !== productType) continue;
    const num = Number(line?.RoolNumber ?? line?.roolNumber ?? line?.id);
    if (num > 0) used.add(num);
  }

  for (const rawNum of allDbRollNumbers || []) {
    const num = Number(rawNum);
    if (num > 0) used.add(num);
  }

  return used;
}

/**
 * Hitung nomor roll berikutnya untuk mesin aktif pada CountingKainLines.
 * Mengambil nomor roll terakhir pada mesin/OP dengan mengabaikan status soft delete.
 *
 * @param {object} params
 * @returns {{ nextRollId: number, activeMachineMax: number, effectiveMax: number, allUsedRolls: Set<number> }}
 */
export function computeNextRollNumber({
  currentMachineId,
  rolls = [],
  rollsByMachine = {},
  existingDbRolls = [],
  allDbRollNumbers = [],
  maxRollNumber = 0,
  machineMaxRoll = 0,
  startRollNumber = null,
} = {}) {
  const machineKey = String(currentMachineId || '1').trim() || '1';

  const currentMachineRolls = (rolls || []).filter(
    (r) => String(r?.noMesin || machineKey).trim() === machineKey
  );
  const localMachineMax = currentMachineRolls.length > 0
    ? Math.max(...currentMachineRolls.map((r) => Number(r?.id) || 0))
    : 0;

  const dbMachineEntry = rollsByMachine?.[machineKey];
  const dbMachineRolls = Array.isArray(dbMachineEntry?.rolls) ? dbMachineEntry.rolls : [];
  const dbMachineMaxFromList = dbMachineRolls.length > 0
    ? Math.max(...dbMachineRolls.map((n) => Number(n) || 0))
    : 0;

  const dbMachineMax = Math.max(
    dbMachineMaxFromList,
    Number(dbMachineEntry?.maxRoll) || 0,
    Number(machineMaxRoll) || 0
  );

  const activeMachineMax = Math.max(localMachineMax, dbMachineMax);

  const localGlobalMax = (rolls || []).length > 0
    ? Math.max(...rolls.map((r) => Number(r?.id) || 0))
    : 0;
  const allDbMax = (allDbRollNumbers || []).length > 0
    ? Math.max(...allDbRollNumbers.map((n) => Number(n) || 0))
    : 0;
  const effectiveMax = Math.max(localGlobalMax, Number(maxRollNumber) || 0, allDbMax);

  const allUsedRolls = collectUsedRollNumbers({
    rolls,
    existingDbRolls,
    allDbRollNumbers,
    productType: 5,
  });

  const parsedStart = Number(startRollNumber) || 0;
  let nextRollId;
  if (parsedStart > 0 && parsedStart > activeMachineMax) {
    nextRollId = parsedStart;
  } else if (activeMachineMax > 0) {
    nextRollId = activeMachineMax + 1;
  } else {
    nextRollId = machineKey === '1' && effectiveMax === 0
      ? 1
      : (effectiveMax > 0 ? effectiveMax + 1 : 1);
  }

  while (allUsedRolls.has(nextRollId)) {
    nextRollId += 1;
  }

  return {
    nextRollId,
    activeMachineMax,
    effectiveMax,
    allUsedRolls,
  };
}

/**
 * Hitung nomor roll Co-Product berikutnya (>= 9001), mengabaikan status soft delete.
 *
 * @param {object} params
 * @returns {{ nextCoProductId: number, usedCoProductNumbers: Set<number> }}
 */
export function computeNextCoProductNumber({
  coProducts = [],
  existingDbRolls = [],
  allDbCoProductNumbers = [],
  maxCoProductRoll = 0,
} = {}) {
  const usedCoProductNumbers = collectUsedRollNumbers({
    rolls: coProducts,
    existingDbRolls,
    allDbRollNumbers: allDbCoProductNumbers,
    productType: 1,
  });

  const localMax = (coProducts || []).length > 0
    ? Math.max(...coProducts.map((c) => Number(c?.id) || 0))
    : 0;
  const dbMax = (allDbCoProductNumbers || []).length > 0
    ? Math.max(...allDbCoProductNumbers.map((n) => Number(n) || 0))
    : 0;
  const highest = Math.max(localMax, dbMax, Number(maxCoProductRoll) || 0);

  let nextCoProductId = highest >= 9001 ? highest + 1 : 9001;
  while (usedCoProductNumbers.has(nextCoProductId)) {
    nextCoProductId += 1;
  }

  return {
    nextCoProductId,
    usedCoProductNumbers,
  };
}

