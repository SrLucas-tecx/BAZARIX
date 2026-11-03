// Prueba de storage.js sin navegador:  node test_storage.js
const store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] };
const { Sync, TeamAdapter, StorageAdapter, STORAGE_KEY, TEAM_CACHE_KEY, DemoTransport } = require("./js/storage.js");
const assert = require("node:assert/strict");
(async () => {
  const seen = []; Sync.on((s) => seen.push(s.status));
  // local
  assert.equal(StorageAdapter.mode(), "local");
  assert.equal(StorageAdapter.save({ a: 1 }), true);
  assert.deepEqual(JSON.parse(StorageAdapter.load()), { a: 1 });
  assert.ok(store[STORAGE_KEY]); assert.equal(Sync.status, "saved");
  // team
  store.BAZARIX_STORAGE_MODE = "team";
  Object.assign(TeamAdapter, { minSavingMs: 0, debounceMs: 5 }); DemoTransport.latency = () => 5;
  assert.equal(StorageAdapter.load(), null, "los modos no se mezclan");
  StorageAdapter.save({ b: 1 }); assert.equal(Sync.status, "pending");
  assert.ok(store[TEAM_CACHE_KEY], "cache local inmediato");
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(Sync.status, "saved"); assert.deepEqual(JSON.parse(store.BAZARIX_DEMO_REMOTE), { b: 1 });
  assert.ok(seen.includes("saving"));
  // fallo y reintento (backoff 2 s)
  store.BAZARIX_DEMO_FAIL = "1"; const st = { b: 2 };
  StorageAdapter.save(st); await new Promise((r) => setTimeout(r, 60));
  assert.equal(Sync.status, "error"); assert.equal(TeamAdapter.dirty, true);
  store.BAZARIX_DEMO_FAIL = "0"; st.b = 3;           // cambio mientras estaba en error: se manda lo último
  await TeamAdapter.flush();
  assert.equal(Sync.status, "saved"); assert.deepEqual(JSON.parse(store.BAZARIX_DEMO_REMOTE), { b: 3 });
  console.log("TODO OK", seen.join(">")); process.exit(0);
})().catch((e) => { console.error("FALLA", e); process.exit(1); });
