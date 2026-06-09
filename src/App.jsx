import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ─── Timezone Fix ────────────────────────────────────────────────────────────
function getLocalDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;
  return `${year}-${month}-${day}`;
}

// ─── Bar Colors ───────────────────────────────────────────────────────────────
function getCalBarColor(entry) {
  if (!entry?.goal) return "#555";
  if (entry.calories > entry.goal) return "#ff4d4d";
  if (entry.calories >= entry.goal * 0.95) return "#00e096";
  return "#ffab00";
}

function getReadBarColor(entry) {
  if (!entry?.goal) return "#555";
  if (entry.minutes >= entry.goal) return "#00e096";
  if (entry.minutes >= entry.goal * 0.5) return "#ffab00";
  return "#ff4d4d";
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────
const ttStyle = {
  background: "#1a1a2e",
  border: "1px solid #333",
  borderRadius: "10px",
  padding: "10px 16px",
  fontFamily: "'DM Mono', monospace",
  fontSize: "13px",
  color: "#e0e0e0",
};

const CalTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const cal = payload.find((p) => p.dataKey === "calories");
  return (
    <div style={ttStyle}>
      <div style={{ color: "#888", marginBottom: 4 }}>{label}</div>
      {cal && <div style={{ color: getCalBarColor(cal.payload) }}>{cal.value} kcal</div>}
    </div>
  );
};

const ReadTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const min = payload.find((p) => p.dataKey === "minutes");
  return (
    <div style={ttStyle}>
      <div style={{ color: "#888", marginBottom: 4 }}>{label}</div>
      {min && <div style={{ color: getReadBarColor(min.payload) }}>{min.value} min</div>}
    </div>
  );
};

export default function App() {
  const [currentPage, setCurrentPage] = useState(0);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  // ─── Calories state ────────────────────────────────────────────────────────
  const [total, setTotal] = useState(0);
  const [goal, setGoal] = useState(2300);
  const [inputCalories, setInputCalories] = useState("");
  const [history, setHistory] = useState([]);
  const [rangeType, setRangeType] = useState("7");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // ─── Calculator state ──────────────────────────────────────────────────────
  const [calcDisplay, setCalcDisplay] = useState("");
  const [calcBuffer, setCalcBuffer] = useState(null);
  const [calcOperator, setCalcOperator] = useState(null);
  const [calcFresh, setCalcFresh] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  // ─── Reading state ─────────────────────────────────────────────────────────
  const [readTotal, setReadTotal] = useState(0);
  const [readGoal, setReadGoal] = useState(30);
  const [readInput, setReadInput] = useState("");
  const [readHistory, setReadHistory] = useState([]);
  const [readRangeType, setReadRangeType] = useState("7");
  const [readStartDate, setReadStartDate] = useState("");
  const [readEndDate, setReadEndDate] = useState("");
  const [readError, setReadError] = useState("");

  // ─── Swipe ─────────────────────────────────────────────────────────────────
  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0 && currentPage === 0) setCurrentPage(1);
      if (dx > 0 && currentPage === 1) setCurrentPage(0);
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  // ─── Calculator logic ──────────────────────────────────────────────────────
  function calcPress(val) {
    if (typeof val === "number" || val === ".") {
      if (calcFresh) {
        setCalcDisplay(String(val));
        setCalcFresh(false);
      } else {
        setCalcDisplay((prev) => (prev === "0" ? String(val) : prev + val));
      }
    } else if (["+", "-", "×", "÷"].includes(val)) {
      setCalcBuffer(parseFloat(calcDisplay) || 0);
      setCalcOperator(val);
      setCalcFresh(true);
    } else if (val === "=") {
      const a = calcBuffer ?? 0;
      const b = parseFloat(calcDisplay) || 0;
      let res = 0;
      if (calcOperator === "+") res = a + b;
      else if (calcOperator === "-") res = a - b;
      else if (calcOperator === "×") res = a * b;
      else if (calcOperator === "÷") res = b !== 0 ? a / b : 0;
      else res = b;
      const rounded = Math.round(res * 100) / 100;
      setCalcDisplay(String(rounded));
      setCalcBuffer(null);
      setCalcOperator(null);
      setCalcFresh(true);
    } else if (val === "C") {
      setCalcDisplay("0");
      setCalcBuffer(null);
      setCalcOperator(null);
      setCalcFresh(false);
    } else if (val === "→") {
      const val2 = parseFloat(calcDisplay);
      if (!isNaN(val2)) {
        setInputCalories(String(Math.round(val2)));
        setShowCalc(false);
        setCalcDisplay("0");
        setCalcBuffer(null);
        setCalcOperator(null);
        setCalcFresh(false);
      }
    }
  }

  const calcButtons = [
    ["C", "÷", "×", "-"],
    [7, 8, 9, "+"],
    [4, 5, 6, "="],
    [1, 2, 3, "→"],
    [0, "."],
  ];

  // ─── Calories DB ───────────────────────────────────────────────────────────
  async function fetchByRange(from, to) {
    const { data } = await supabase
      .from("calories_history")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });
    if (data) setHistory(data);
  }

  function loadPreset(days) {
    const todayStr = getLocalDate();
    const today = new Date(todayStr);
    const past = new Date(today);
    past.setDate(today.getDate() - days);
    const from = past.toISOString().split("T")[0];
    setRangeType(days.toString());
    fetchByRange(from, todayStr);
  }

  async function addCalories(amount) {
    const today = getLocalDate();
    const { data } = await supabase
      .from("calories_history")
      .select("*")
      .eq("date", today)
      .maybeSingle();

    let newTotal = amount;
    if (data) {
      newTotal = data.calories + amount;
      await supabase.from("calories_history").update({ calories: newTotal }).eq("date", today);
    } else {
      await supabase.from("calories_history").insert([{ date: today, calories: amount, goal }]);
    }
    setTotal(newTotal);
    if (rangeType === "custom" && startDate && endDate) {
      fetchByRange(startDate, endDate);
    } else {
      loadPreset(Number(rangeType));
    }
  }

  // ─── Reading DB ────────────────────────────────────────────────────────────
  function fillReadGaps(from, to, data, fallbackGoal) {
    const dataMap = {};
    data.forEach((d) => { dataMap[d.date] = d; });
    const result = [];
    const cur = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    while (cur <= end) {
      const dateStr = cur.toISOString().split("T")[0];
      result.push(dataMap[dateStr] ?? { date: dateStr, minutes: 0, goal: fallbackGoal });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }

  async function fetchReadByRange(from, to) {
    const { data, error } = await supabase
      .from("reading_history")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });
    if (error) console.error("reading fetch error:", error);
    if (data) setReadHistory(fillReadGaps(from, to, data, readGoal));
  }

  function loadReadPreset(days) {
    const todayStr = getLocalDate();
    const today = new Date(todayStr);
    const past = new Date(today);
    past.setDate(today.getDate() - days);
    const from = past.toISOString().split("T")[0];
    setReadRangeType(days.toString());
    fetchReadByRange(from, todayStr);
  }

  async function addMinutes(amount) {
    setReadError("");
    const today = getLocalDate();
    const { data, error: selErr } = await supabase
      .from("reading_history")
      .select("*")
      .eq("date", today)
      .maybeSingle();
    if (selErr) { setReadError("Error leyendo datos: " + selErr.message); return; }

    let newTotal = amount;
    if (data) {
      newTotal = data.minutes + amount;
      const { error: updErr } = await supabase.from("reading_history").update({ minutes: newTotal }).eq("date", today);
      if (updErr) { setReadError("Error actualizando: " + updErr.message); return; }
    } else {
      const { error: insErr } = await supabase.from("reading_history").insert([{ date: today, minutes: amount, goal: readGoal }]);
      if (insErr) { setReadError("Error guardando: " + insErr.message); return; }
    }
    setReadTotal(newTotal);
    if (readRangeType === "custom" && readStartDate && readEndDate) {
      fetchReadByRange(readStartDate, readEndDate);
    } else {
      loadReadPreset(Number(readRangeType));
    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const today = getLocalDate();

      const { data: calData } = await supabase
        .from("calories_history")
        .select("*")
        .eq("date", today)
        .maybeSingle();
      if (calData) {
        setTotal(calData.calories);
        setGoal(calData.goal);
      } else {
        setTotal(0);
        const { data: prevDay } = await supabase
          .from("calories_history")
          .select("goal")
          .lt("date", today)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prevDay?.goal) setGoal(prevDay.goal);
      }
      loadPreset(7);

      const { data: readData } = await supabase
        .from("reading_history")
        .select("*")
        .eq("date", today)
        .maybeSingle();
      if (readData) {
        setReadTotal(readData.minutes);
        setReadGoal(readData.goal);
      } else {
        setReadTotal(0);
        const { data: prevRead } = await supabase
          .from("reading_history")
          .select("goal")
          .lt("date", today)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        const goalForToday = prevRead?.goal || 30;
        if (prevRead?.goal) setReadGoal(goalForToday);
        await supabase.from("reading_history").insert([{ date: today, minutes: 0, goal: goalForToday }]);
      }
      loadReadPreset(7);
    }
    init();
  }, []);

  // ─── Derived values ────────────────────────────────────────────────────────
  const progress = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;
  const readProgress = readGoal > 0 ? Math.min((readTotal / readGoal) * 100, 100) : 0;

  const avgCalories = history.length > 0
    ? Math.round(history.reduce((s, d) => s + d.calories, 0) / history.length) : 0;
  const avgGoal = history.length > 0
    ? Math.round(history.reduce((s, d) => s + (d.goal || goal), 0) / history.length) : goal;

  const avgMinutes = readHistory.length > 0
    ? Math.round(readHistory.reduce((s, d) => s + d.minutes, 0) / readHistory.length) : 0;
  const avgReadGoal = readHistory.length > 0
    ? Math.round(readHistory.reduce((s, d) => s + (d.goal || readGoal), 0) / readHistory.length) : readGoal;

  const calColor = progress >= 100 ? "#ff4d4d" : progress >= 95 ? "#00e096" : "#ffab00";
  const readColor = readProgress >= 100 ? "#00e096" : readProgress >= 95 ? "#00e096" : "#ffab00";

  // ─── Styles ────────────────────────────────────────────────────────────────
  const S = {
    card: {
      background: "#13131f",
      border: "1px solid #1e1e30",
      borderRadius: "16px",
      padding: "20px",
      marginBottom: "16px",
    },
    label: {
      fontSize: "11px",
      letterSpacing: "3px",
      textTransform: "uppercase",
      color: "#444",
      marginBottom: "12px",
    },
    input: {
      background: "#0d0d14",
      border: "1px solid #2a2a40",
      borderRadius: "10px",
      color: "#e8e8f0",
      fontFamily: "'DM Mono', monospace",
      fontSize: "24px",
      padding: "12px 16px",
      width: "100%",
      boxSizing: "border-box",
      outline: "none",
      textAlign: "center",
    },
    btnPrimary: {
      background: "#00e096",
      color: "#0d0d14",
      border: "none",
      borderRadius: "10px",
      padding: "12px 24px",
      fontFamily: "'DM Mono', monospace",
      fontSize: "13px",
      fontWeight: 700,
      letterSpacing: "2px",
      cursor: "pointer",
      textTransform: "uppercase",
      transition: "opacity 0.2s",
      flex: 1,
    },
    btnSecondary: (active) => ({
      background: active ? "#1e1e30" : "transparent",
      color: active ? "#e8e8f0" : "#444",
      border: `1px solid ${active ? "#2a2a40" : "#1e1e30"}`,
      borderRadius: "8px",
      padding: "8px 14px",
      fontFamily: "'DM Mono', monospace",
      fontSize: "11px",
      letterSpacing: "2px",
      cursor: "pointer",
      textTransform: "uppercase",
      transition: "all 0.2s",
    }),
    calcBtn: (type) => {
      const colors = {
        op:  { bg: "#1a1a2e", color: "#a78bfa", border: "#2a2a50" },
        eq:  { bg: "#00e096", color: "#0d0d14", border: "#00e096" },
        use: { bg: "#ffab00", color: "#0d0d14", border: "#ffab00" },
        clr: { bg: "#ff4d4d22", color: "#ff4d4d", border: "#ff4d4d44" },
        num: { bg: "#1e1e2e", color: "#e8e8f0", border: "#2a2a40" },
      };
      const c = colors[type] || colors.num;
      return {
        background: c.bg, color: c.color, border: `1px solid ${c.border}`,
        borderRadius: "8px", padding: "12px", fontFamily: "'DM Mono', monospace",
        fontSize: "15px", fontWeight: 700, cursor: "pointer", transition: "opacity 0.15s",
      };
    },
    dateInput: {
      background: "#0d0d14", border: "1px solid #2a2a40", borderRadius: "8px",
      color: "#e8e8f0", fontFamily: "'DM Mono', monospace", fontSize: "12px",
      padding: "8px 10px", flex: 1, minWidth: "120px", outline: "none",
    },
  };

  function btnType(v) {
    if (v === "C") return "clr";
    if (v === "=") return "eq";
    if (v === "→") return "use";
    if (["+", "-", "×", "÷"].includes(v)) return "op";
    return "num";
  }

  // ─── Shared chart renderer ─────────────────────────────────────────────────
  function renderChart(data, dataKey, getColor, avgVal, avgG, tooltipComp) {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#1a1a28" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#444", fontSize: 10, fontFamily: "'DM Mono', monospace" }}
            tickFormatter={(d) => d.slice(5)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#444", fontSize: 10, fontFamily: "'DM Mono', monospace" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={tooltipComp} cursor={{ fill: "#1e1e2e" }} />
          <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry)} />
            ))}
          </Bar>
          <ReferenceLine y={avgG} stroke="#4dd8ff" strokeDasharray="6 4" strokeWidth={1.5} label={false} />
          {data.length > 0 && (
            <ReferenceLine y={avgVal} stroke="#a78bfa" strokeDasharray="6 4" strokeWidth={1.5} label={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // ─── Shared range controls renderer ───────────────────────────────────────
  function renderRangeControls(rangeT, setRangeT, loadFn, sDate, setSDate, eDate, setEDate, fetchFn) {
    return (
      <>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          <button style={S.btnSecondary(rangeT === "7")} onClick={() => loadFn(7)}>7 días</button>
          <button style={S.btnSecondary(rangeT === "30")} onClick={() => loadFn(30)}>30 días</button>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "20px" }}>
          <input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} style={S.dateInput} />
          <span style={{ color: "#333", fontSize: "12px" }}>→</span>
          <input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} style={S.dateInput} />
          <button
            style={{ ...S.btnSecondary(rangeT === "custom"), padding: "8px 16px" }}
            onClick={() => { if (sDate && eDate) { setRangeT("custom"); fetchFn(sDate, eDate); } }}
          >
            Aplicar
          </button>
        </div>
      </>
    );
  }

  const pageInner = {
    color: "#e8e8f0",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    padding: "32px 20px 80px",
    maxWidth: "720px",
    margin: "0 auto",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        html, body { margin: 0; overflow-x: hidden; }
        body { background: #0d0d14; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.4); }
        input[type=date] { color-scheme: dark; }
      `}</style>

      <div
        style={{ overflow: "hidden", width: "100vw", background: "#0d0d14" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── Slides wrapper ── */}
        <div style={{
          display: "flex",
          width: "200vw",
          transform: `translateX(${currentPage === 0 ? "0" : "-100vw"})`,
          transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
        }}>

          {/* ══ Page 0: Calories ══ */}
          <div style={{ width: "100vw", minHeight: "100vh", background: "#0d0d14" }}>
            <div style={pageInner}>

              {/* Header */}
              <div style={{ marginBottom: "32px" }}>
                <div style={{ fontSize: "13px", letterSpacing: "6px", textTransform: "uppercase", color: "#555", marginBottom: "4px" }}>
                  Calorie Tracker
                </div>
                <div style={{ fontSize: "clamp(48px, 10vw, 80px)", fontWeight: 700, letterSpacing: "-2px", lineHeight: 1, color: calColor, fontFamily: "'DM Mono', monospace" }}>
                  {total.toLocaleString()}
                </div>
                <div style={{ fontSize: "14px", color: "#555", marginTop: "6px" }}>meta: {goal.toLocaleString()} kcal</div>
                <div style={{ width: "100%", height: "6px", background: "#1e1e2e", borderRadius: "6px", margin: "20px 0 32px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: calColor, borderRadius: "6px", transition: "width 0.4s ease" }} />
                </div>
              </div>

              {/* Add Calories */}
              <div style={S.card}>
                <div style={S.label}>Agregar calorías</div>
                <input
                  type="number"
                  style={S.input}
                  value={inputCalories}
                  onChange={(e) => setInputCalories(e.target.value)}
                  placeholder="0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const amt = Number(inputCalories);
                      if (!amt) return;
                      addCalories(amt);
                      setInputCalories("");
                    }
                  }}
                />
                <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                  <button
                    style={S.btnPrimary}
                    onClick={() => {
                      const amt = Number(inputCalories);
                      if (!amt) return;
                      addCalories(amt);
                      setInputCalories("");
                    }}
                  >
                    + Agregar
                  </button>
                  <button
                    style={{
                      ...S.btnSecondary(showCalc),
                      padding: "12px 16px",
                      fontSize: "16px",
                      border: `1px solid ${showCalc ? "#a78bfa" : "#2a2a40"}`,
                      color: showCalc ? "#a78bfa" : "#555",
                    }}
                    onClick={() => setShowCalc((v) => !v)}
                    title="Calculadora"
                  >
                    ÷×
                  </button>
                </div>

                {showCalc && (
                  <div style={{ marginTop: "16px", background: "#0d0d14", border: "1px solid #1e1e30", borderRadius: "12px", padding: "14px" }}>
                    <div style={{
                      background: "#060610", borderRadius: "8px", padding: "10px 14px",
                      marginBottom: "10px", textAlign: "right", fontSize: "22px",
                      fontFamily: "'DM Mono', monospace", color: "#e8e8f0", minHeight: "44px",
                      letterSpacing: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {calcOperator && (
                        <span style={{ color: "#a78bfa", fontSize: "13px", marginRight: "8px" }}>
                          {calcBuffer} {calcOperator}
                        </span>
                      )}
                      {calcDisplay || "0"}
                    </div>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {calcButtons.map((row, ri) => (
                        <div key={ri} style={{ display: "grid", gridTemplateColumns: row.length === 2 ? "1fr 1fr" : "repeat(4, 1fr)", gap: "8px" }}>
                          {row.map((v) => (
                            <button key={v} style={S.calcBtn(btnType(v))} onClick={() => calcPress(v)} title={v === "→" ? "Usar resultado" : undefined}>
                              {v === "→" ? "usar →" : v}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: "10px", color: "#333", marginTop: "10px", textAlign: "center", letterSpacing: "1px" }}>
                      PRESIONA "USAR →" PARA PASAR EL RESULTADO AL CAMPO
                    </div>
                  </div>
                )}
              </div>

              {/* Goal */}
              <div style={S.card}>
                <div style={S.label}>Meta diaria (kcal)</div>
                <input
                  type="number"
                  style={{ ...S.input, fontSize: "18px" }}
                  value={goal}
                  onChange={async (e) => {
                    const newGoal = Number(e.target.value);
                    setGoal(newGoal);
                    const today = getLocalDate();
                    await supabase.from("calories_history").update({ goal: newGoal }).eq("date", today);
                  }}
                />
              </div>

              {/* History */}
              <div style={S.card}>
                <div style={S.label}>Historial</div>
                {renderRangeControls(rangeType, setRangeType, loadPreset, startDate, setStartDate, endDate, setEndDate, fetchByRange)}
                {history.length > 0 && (
                  <div style={{ display: "flex", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
                    {[
                      { color: "#00e096", label: "En meta" },
                      { color: "#ffab00", label: "Bajo meta" },
                      { color: "#ff4d4d", label: "Sobre meta" },
                      { color: "#a78bfa", label: `Promedio: ${avgCalories} kcal` },
                      { color: "#4dd8ff", label: `Meta: ${avgGoal} kcal` },
                    ].map((l) => (
                      <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "20px", height: "2px", background: l.color, borderRadius: "2px" }} />
                        <span style={{ fontSize: "10px", color: "#555", letterSpacing: "1px" }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {renderChart(history, "calories", getCalBarColor, avgCalories, avgGoal, <CalTooltip />)}
              </div>

            </div>
          </div>

          {/* ══ Page 1: Reading ══ */}
          <div style={{ width: "100vw", minHeight: "100vh", background: "#0d0d14" }}>
            <div style={pageInner}>

              {/* Header */}
              <div style={{ marginBottom: "32px" }}>
                <div style={{ fontSize: "13px", letterSpacing: "6px", textTransform: "uppercase", color: "#555", marginBottom: "4px" }}>
                  Reading Tracker
                </div>
                <div style={{ fontSize: "clamp(48px, 10vw, 80px)", fontWeight: 700, letterSpacing: "-2px", lineHeight: 1, color: readColor, fontFamily: "'DM Mono', monospace" }}>
                  {readTotal.toLocaleString()}
                </div>
                <div style={{ fontSize: "14px", color: "#555", marginTop: "6px" }}>meta: {readGoal.toLocaleString()} min</div>
                <div style={{ width: "100%", height: "6px", background: "#1e1e2e", borderRadius: "6px", margin: "20px 0 32px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${readProgress}%`, background: readColor, borderRadius: "6px", transition: "width 0.4s ease" }} />
                </div>
              </div>

              {/* Add Minutes */}
              <div style={S.card}>
                <div style={S.label}>Agregar minutos</div>
                <input
                  type="number"
                  style={S.input}
                  value={readInput}
                  onChange={(e) => setReadInput(e.target.value)}
                  placeholder="0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const amt = Number(readInput);
                      if (!amt) return;
                      addMinutes(amt);
                      setReadInput("");
                    }
                  }}
                />
                <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                  <button
                    style={S.btnPrimary}
                    onClick={() => {
                      const amt = Number(readInput);
                      if (!amt) return;
                      addMinutes(amt);
                      setReadInput("");
                    }}
                  >
                    + Agregar
                  </button>
                </div>
                {readError && (
                  <div style={{ marginTop: "10px", color: "#ff4d4d", fontSize: "12px", letterSpacing: "0.5px" }}>
                    {readError}
                  </div>
                )}
              </div>

              {/* Reading Goal */}
              <div style={S.card}>
                <div style={S.label}>Meta diaria (min)</div>
                <input
                  type="number"
                  style={{ ...S.input, fontSize: "18px" }}
                  value={readGoal}
                  onChange={async (e) => {
                    const newGoal = Number(e.target.value);
                    setReadGoal(newGoal);
                    const today = getLocalDate();
                    await supabase.from("reading_history").update({ goal: newGoal }).eq("date", today);
                  }}
                />
              </div>

              {/* Reading History */}
              <div style={S.card}>
                <div style={S.label}>Historial</div>
                {renderRangeControls(readRangeType, setReadRangeType, loadReadPreset, readStartDate, setReadStartDate, readEndDate, setReadEndDate, fetchReadByRange)}
                {readHistory.length > 0 && (
                  <div style={{ display: "flex", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
                    {[
                      { color: "#00e096", label: "Meta cumplida" },
                      { color: "#ffab00", label: "Parcial" },
                      { color: "#ff4d4d", label: "Poco" },
                      { color: "#a78bfa", label: `Promedio: ${avgMinutes} min` },
                      { color: "#4dd8ff", label: `Meta: ${avgReadGoal} min` },
                    ].map((l) => (
                      <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "20px", height: "2px", background: l.color, borderRadius: "2px" }} />
                        <span style={{ fontSize: "10px", color: "#555", letterSpacing: "1px" }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {renderChart(readHistory, "minutes", getReadBarColor, avgMinutes, avgReadGoal, <ReadTooltip />)}
              </div>

            </div>
          </div>

        </div>

        {/* ── Page indicator dots ── */}
        <div style={{
          position: "fixed",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "8px",
          zIndex: 100,
        }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              onClick={() => setCurrentPage(i)}
              style={{
                width: currentPage === i ? "20px" : "8px",
                height: "8px",
                borderRadius: "4px",
                background: currentPage === i ? "#e8e8f0" : "#333",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            />
          ))}
        </div>

      </div>
    </>
  );
}
