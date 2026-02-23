import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

/*
========================================
 TIMEZONE FIX ROBUSTO
========================================
*/
function getLocalDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());

  const year = parts.find(p => p.type === "year").value;
  const month = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;

  return `${year}-${month}-${day}`;
}

function App() {
  const [total, setTotal] = useState(0);
  const [goal, setGoal] = useState(2200);
  const [inputCalories, setInputCalories] = useState("");
  const [history, setHistory] = useState([]);

  const [rangeType, setRangeType] = useState("7");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  /*
  ========================================
  BAR COLOR
  ========================================
  */
  function getBarColor(entry) {
    if (!entry?.goal) return "#ccc";

    const lowerLimit = entry.goal * 0.95;

    if (entry.calories > entry.goal) return "#f44336";
    if (entry.calories >= lowerLimit) return "#4caf50";

    return "#ff9800";
  }

  /*
  ========================================
  FETCH RANGE
  ========================================
  */
  async function fetchByRange(from, to) {
    const { data } = await supabase
      .from("calories_history")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });

    if (data) setHistory(data);
  }

  /*
  ========================================
  PRESET HISTORY
  ========================================
  */
  function loadPreset(days) {
    const todayStr = getLocalDate();
    const today = new Date(todayStr);

    const past = new Date(today);
    past.setDate(today.getDate() - days);

    const from = past.toISOString().split("T")[0];
    const to = todayStr;

    setRangeType(days.toString());
    fetchByRange(from, to);
  }

  /*
  ========================================
  ADD CALORIES
  ========================================
  */
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

      await supabase
        .from("calories_history")
        .update({ calories: newTotal })
        .eq("date", today);
    } else {
      await supabase.from("calories_history").insert([
        {
          date: today,
          calories: amount,
          goal: goal,
        },
      ]);
    }

    setTotal(newTotal);

    if (rangeType === "custom") {
      if (startDate && endDate) {
        fetchByRange(startDate, endDate);
      }
    } else {
      loadPreset(Number(rangeType));
    }
  }

  /*
  ========================================
  INITIAL LOAD
  ========================================
  */
  useEffect(() => {
    async function init() {
      const today = getLocalDate();

      const { data } = await supabase
        .from("calories_history")
        .select("*")
        .eq("date", today)
        .maybeSingle();

      if (data) {
        setTotal(data.calories);
        setGoal(data.goal);
      } else {
        setTotal(0);
      }

      loadPreset(7);
    }

    init();
  }, []);

  const progress =
    goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

  /*
  ========================================
  RENDER
  ========================================
  */
  return (
    <div style={{
      textAlign: "center",
      marginTop: "30px",
      fontFamily: "Arial",
      maxWidth: "100%",
      overflowX: "hidden",
      padding: "10px",
    }}>
      <h1>Calorías de Hoy</h1>

      <div style={{
        width: "300px",
        height: "30px",
        backgroundColor: "#ddd",
        margin: "20px auto",
        borderRadius: "20px",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${progress}%`,
          height: "100%",
          backgroundColor: progress >= 100 ? "red" : "#4caf50",
          transition: "width 0.3s ease",
        }} />
      </div>

      <h2>{total} / {goal} kcal</h2>

      <div style={{ marginTop: "20px" }}>
        <input
          type="number"
          value={inputCalories}
          onChange={(e) => setInputCalories(e.target.value)}
          placeholder="Ingrese calorías"
        />

        <button
          style={{
            marginLeft: "10px",
            padding: "8px 15px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: "#4caf50",
            color: "white",
            cursor: "pointer",
          }}
          onClick={() => {
            const amount = Number(inputCalories);
            if (!amount) return;

            addCalories(amount);
            setInputCalories("");
          }}
        >
          Agregar
        </button>
      </div>

      <div style={{ marginTop: "20px" }}>
        <input
          type="number"
          value={goal}
          onChange={async (e) => {
            const newGoal = Number(e.target.value);
            setGoal(newGoal);

            const today = getLocalDate();

            await supabase
              .from("calories_history")
              .update({ goal: newGoal })
              .eq("date", today);
          }}
          placeholder="Cambiar meta"
        />
      </div>

      <div style={{ marginTop: "50px" }}>
        <h2>Historial</h2>

        <button onClick={() => loadPreset(7)}>
          Últimos 7 días
        </button>

        <button style={{ marginLeft: "10px" }}
          onClick={() => loadPreset(30)}>
          Últimos 30 días
        </button>

        <div style={{ marginTop: "15px" }}>
          <input type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />

          <input type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ marginLeft: "10px" }}
          />

          <button style={{ marginLeft: "10px" }}
            onClick={() => {
              if (startDate && endDate) {
                setRangeType("custom");
                fetchByRange(startDate, endDate);
              }
            }}>
            Aplicar
          </button>
        </div>

        <BarChart
          width={window.innerWidth * 0.9}
          height={250}
          data={history}
          style={{ margin: "30px auto" }}
        >
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="calories">
            {history.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getBarColor(entry)}
              />
            ))}
          </Bar>
        </BarChart>
      </div>
    </div>
  );
}

export default App;