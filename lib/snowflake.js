// Fecha de creación aproximada derivada del ID numérico.

/** TikTok: los 32 bits altos del ID son el instante de creación (segundos Unix). */
export function tiktokDateFromId(id) {
  try {
    const s = Number(BigInt(id) >> 32n);
    if (s > Date.UTC(2014, 0, 1) / 1000 && s < Date.now() / 1000 + 86400) return new Date(s * 1000).toISOString();
  } catch { /* ID no numérico */ }
  return null;
}

/** X: Snowflake → (id >> 22) + epoch de Twitter (1288834974657 ms). Solo IDs posteriores a ~2013. */
export function xDateFromId(id) {
  try {
    const big = BigInt(id);
    if (big < 100000000000000n) return null; // IDs antiguos secuenciales: no codifican fecha
    const ms = Number((big >> 22n) + 1288834974657n);
    if (ms < Date.now() + 86400000) return new Date(ms).toISOString();
  } catch { /* ID no numérico */ }
  return null;
}
