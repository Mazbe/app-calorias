import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
  Line,
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

// ─── Bar Color ────────────────────────────────────────────────────────────────
function getBarColor(entry) {
  if (!entry?.goal) return "#555";
  if (entry.calories > entry.goal) return "#ff4d4d";
  if (entry.calories >= entry.goal * 0.95) return "#00e096";
  return "#ffab00";
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const cal = payload.find((p) => p.dataKey === "calories");
    return (
      <div style={{
        background: "#1a1a2e",
        border: "1px solid #333",
        borderRadius: "10px",
        padding: "10px 16px",
        fontFamily: "'DM Mono', monospace",
        fontSize: "13px",
        color: "#e0e0e0",
      }}>
        <div style={{ color: "#888", marginBottom: 4 }}>{label}</div>
        {cal && <div style={{ color: getBarColor(cal.payload) }}>{cal.value} kcal</div>}
      </div>
    );
  }
  return null;
};

export default function App() {
  const [total, setTotal] = useState(0);
  const [goal, setGoal] = useState(2200);
  const [inputCalories, setInputCalories] = useState("");
  const [history, setHistory] = useState([]);
  const [rangeType, setRangeType] = useState("7");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Calculadora
  const [calcDisplay, setCalcDisplay] = useState("");
  const [calcBuffer, setCalcBuffer] = useState(null);
  const [calcOperator, setCalcOperator] = useState(null);
  const [calcFresh, setCalcFresh] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  // ─── Calculadora logic ─────────────────────────────────────────────────────
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

  // ─── Fetch range ───────────────────────────────────────────────────────────
  async function fetchByRange(from, to) {
    const { data } = await supabase
      .from("calories_history")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });
    if (data) setHistory(data);
  }

  // ─── Preset history ────────────────────────────────────────────────────────
  function loadPreset(days) {
    const todayStr = getLocalDate();
    const today = new Date(todayStr);
    const past = new Date(today);
    past.setDate(today.getDate() - days);
    const from = past.toISOString().split("T")[0];
    setRangeType(days.toString());
    fetchByRange(from, todayStr);
  }

  // ─── Add calories ──────────────────────────────────────────────────────────
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

  // ─── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const today = getLocalDate();
      const { data } = await supabase
        .from("calories_history")
        .select("*")
        .eq("date", today)
        .maybeSingle();
      if (data) { setTotal(data.calories); setGoal(data.goal); }
      else { setTotal(0); }
      loadPreset(7);
    }
    init();
  }, []);

  const progress = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

  // ─── Average line data ─────────────────────────────────────────────────────
  const avgCalories =
    history.length > 0
      ? Math.round(history.reduce((s, d) => s + d.calories, 0) / history.length)
      : 0;

  const avgGoal =
    history.length > 0
      ? Math.round(history.reduce((s, d) => s + (d.goal || goal), 0) / history.length)
      : goal;

  // ─── Styles ────────────────────────────────────────────────────────────────
  const S = {
    root: {
      minHeight: "100vh",
      background: "#0d0d14",
      color: "#e8e8f0",
      fontFamily: "'DM Mono', 'Courier New', monospace",
      padding: "32px 20px 60px",
      maxWidth: "720px",
      margin: "0 auto",
    },
    title: {
      fontSize: "13px",
      letterSpacing: "6px",
      textTransform: "uppercase",
      color: "#555",
      marginBottom: "4px",
    },
    bigNum: {
      fontSize: "clamp(48px, 10vw, 80px)",
      fontWeight: 700,
      letterSpacing: "-2px",
      lineHeight: 1,
      color: progress >= 100 ? "#ff4d4d" : progress >= 95 ? "#00e096" : "#ffab00",
      fontFamily: "'DM Mono', monospace",
    },
    goalText: {
      fontSize: "14px",
      color: "#555",
      marginTop: "6px",
    },
    progressTrack: {
      width: "100%",
      height: "6px",
      background: "#1e1e2e",
      borderRadius: "6px",
      margin: "20px 0 32px",
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      width: `${progress}%`,
      background: progress >= 100 ? "#ff4d4d" : progress >= 95 ? "#00e096" : "#ffab00",
      borderRadius: "6px",
      transition: "width 0.4s ease",
    },
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
        op: { bg: "#1a1a2e", color: "#a78bfa", border: "#2a2a50" },
        eq: { bg: "#00e096", color: "#0d0d14", border: "#00e096" },
        use: { bg: "#ffab00", color: "#0d0d14", border: "#ffab00" },
        clr: { bg: "#ff4d4d22", color: "#ff4d4d", border: "#ff4d4d44" },
        num: { bg: "#1e1e2e", color: "#e8e8f0", border: "#2a2a40" },
      };
      const c = colors[type] || colors.num;
      return {
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        borderRadius: "8px",
        padding: "12px",
        fontFamily: "'DM Mono', monospace",
        fontSize: "15px",
        fontWeight: 700,
        cursor: "pointer",
        transition: "opacity 0.15s",
      };
    },
  };

  function btnType(v) {
    if (v === "C") return "clr";
    if (v === "=") return "eq";
    if (v === "→") return "use";
    if (["+", "-", "×", "÷"].includes(v)) return "op";
    return "num";
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #0d0d14; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.4); }
        input[type=date] { color-scheme: dark; }
      `}</style>
      <div style={S.root}>

        {/* ── Header ── */}
        <div style={{ marginBottom: "32px" }}>
          <div style={S.title}>Calorie Tracker</div>
          <div style={S.bigNum}>{total.toLocaleString()}</div>
          <div style={S.goalText}>meta: {goal.toLocaleString()} kcal</div>
          <div style={S.progressTrack}>
            <div style={S.progressFill} />
          </div>
        </div>

        {/* ── Add Calories ── */}
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
              style={{ ...S.btnPrimary, flex: 1 }}
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

          {/* ── Calculadora ── */}
          {showCalc && (
            <div style={{
              marginTop: "16px",
              background: "#0d0d14",
              border: "1px solid #1e1e30",
              borderRadius: "12px",
              padding: "14px",
            }}>
              {/* Display */}
              <div style={{
                background: "#060610",
                borderRadius: "8px",
                padding: "10px 14px",
                marginBottom: "10px",
                textAlign: "right",
                fontSize: "22px",
                fontFamily: "'DM Mono', monospace",
                color: "#e8e8f0",
                minHeight: "44px",
                letterSpacing: "1px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
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
                      <button
                        key={v}
                        style={S.calcBtn(btnType(v))}
                        onClick={() => calcPress(v)}
                        title={v === "→" ? "Usar resultado" : undefined}
                      >
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

        {/* ── Goal ── */}
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

        {/* ── History ── */}
        <div style={S.card}>
          <div style={S.label}>Historial</div>

          {/* Range buttons */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
            <button style={S.btnSecondary(rangeType === "7")} onClick={() => loadPreset(7)}>7 días</button>
            <button style={S.btnSecondary(rangeType === "30")} onClick={() => loadPreset(30)}>30 días</button>
          </div>

          {/* Custom range */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "20px" }}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                background: "#0d0d14", border: "1px solid #2a2a40", borderRadius: "8px",
                color: "#e8e8f0", fontFamily: "'DM Mono', monospace", fontSize: "12px",
                padding: "8px 10px", flex: 1, minWidth: "120px", outline: "none",
              }}
            />
            <span style={{ color: "#333", fontSize: "12px" }}>→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                background: "#0d0d14", border: "1px solid #2a2a40", borderRadius: "8px",
                color: "#e8e8f0", fontFamily: "'DM Mono', monospace", fontSize: "12px",
                padding: "8px 10px", flex: 1, minWidth: "120px", outline: "none",
              }}
            />
            <button
              style={{ ...S.btnSecondary(rangeType === "custom"), padding: "8px 16px" }}
              onClick={() => {
                if (startDate && endDate) { setRangeType("custom"); fetchByRange(startDate, endDate); }
              }}
            >
              Aplicar
            </button>
          </div>

          {/* Legend */}
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

          {/* Chart */}
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#1e1e2e" }} />
              <Bar dataKey="calories" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {history.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry)} />
                ))}
              </Bar>

              {/* Meta goal line */}
              <ReferenceLine
                y={avgGoal}
                stroke="#4dd8ff"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={false}
              />

              {/* Average line */}
              {history.length > 0 && (
                <ReferenceLine
                  y={avgCalories}
                  stroke="#a78bfa"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

      </div>
    </>
  );
}
