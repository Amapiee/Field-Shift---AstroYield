// Log gỡ lỗi: chỉ in khi chạy với biến môi trường DEBUG=1
//   DEBUG=1 npm start
const enabled = () => !!process.env.DEBUG;

function debug(...args) {
  if (enabled()) console.log("[debug]", ...args);
}

// const done = timer("nasa"); ...; done();  → in "[debug] nasa: 123ms"
function timer(label) {
  const t0 = process.hrtime.bigint();
  return (extra = "") => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    debug(`${label}: ${ms.toFixed(0)}ms`, extra);
    return ms;
  };
}

module.exports = { debug, timer };
