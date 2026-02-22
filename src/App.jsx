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

function App() {
  const [total, setTotal] = useState(0);
  const [goal, setGoal] = useState(2200);
  const [inputCalories, setInputCalories] = useState("");
  const [history, setHistory] = useState([]);

  const [rangeType, setRangeType] = useState("7");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 🔹 Función para decidir color de cada barra
  function getBarColor(entry) {
    if (!entry.goal) return "#ccc";

    const lowerLimit = entry.goal * 0.95;

    if (entry.calories > entry.goal) {
      return "#f44336"; // rojo
    }

    if (entry.calories >= lowerLimit) {
      return "#4caf50"; // verde
    }

    return "#ff9800"; // naranja
  }

  // 🔹 Traer datos por rango
  async function fetchByRange(from, to) {
    const { data, error } = await supabase
      .from("calories_history")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });

    if (!error) {
      setHistory(data);
    }
  }

  // 🔹 Rangos rápidos
  function loadPreset(days) {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - days);

    const from = past.toISOString().split("T")[0];
    const to = today.toISOString().split("T")[0];

    setRangeType(days.toString());
    fetchByRange(from, to);
  }

  // 🔹 Agregar calorías
  async function addCalories(amount) {
    const today = new Date().toISOString().split("T")[0];

    const { data } = await supabase
      .from("calories_history")
      .select("*")
      .eq("date", today)
      .maybeSingle();

    let newTotal;

    if (data) {
      newTotal = data.calories + amount;

      await supabase
        .from("calories_history")
        .update({ calories: newTotal })
        .eq("date", today);
    } else {
      newTotal = amount;

      await supabase
        .from("calories_history")
        .insert([
          {
            date: today,
            calories: amount,
            goal: goal,
          },
        ]);
    }

    setTotal(newTotal);

    // refrescar gráfico
    if (rangeType === "custom") {
      if (startDate && endDate) {
        fetchByRange(startDate, endDate);
      }
    } else {
      loadPreset(Number(rangeType));
    }
  }

  // 🔹 Cargar datos iniciales
  useEffect(() => {
    async function fetchTodayCalories() {
      const today = new Date().toISOString().split("T")[0];

      const { data } = await supabase
        .from("calories_history")
        .select("*")
        .eq("date", today)
        .maybeSingle();

      if (data) {
        setTotal(data.calories);
        setGoal(data.goal);
      }
    }

    fetchTodayCalories();
    loadPreset(7);
  }, []);

  const progress =
    goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

  return (
    <div
      style={{
        textAlign: "center",
        marginTop: "50px",
        fontFamily: "Arial",
      }}
    >
      <h1>Calorías de Hoy</h1>

      {/* Barra progreso */}
      <div
        style={{
          width: "300px",
          height: "30px",
          backgroundColor: "#ddd",
          margin: "20px auto",
          borderRadius: "20px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            backgroundColor:
              progress >= 100 ? "red" : "#4caf50",
            transition: "width 0.3s ease",
          }}
        />
      </div>

      <h2>
        {total} / {goal} kcal
      </h2>

      {/* Input calorías */}
      <div style={{ marginTop: "20px" }}>
        <input
          type="number"
          value={inputCalories}
          onChange={(e) =>
            setInputCalories(e.target.value)
          }
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

      {/* Cambiar meta */}
      <div style={{ marginTop: "20px" }}>
        <input
          type="number"
          value={goal}
          onChange={async (e) => {
            const newGoal = Number(e.target.value);
            setGoal(newGoal);

            const today =
              new Date().toISOString().split("T")[0];

            await supabase
              .from("calories_history")
              .update({ goal: newGoal })
              .eq("date", today);
          }}
          placeholder="Cambiar meta"
        />
      </div>

      {/* 📊 Historial */}
      <div style={{ marginTop: "50px" }}>
        <h2>Historial</h2>

        <button onClick={() => loadPreset(7)}>
          Últimos 7 días
        </button>

        <button
          style={{ marginLeft: "10px" }}
          onClick={() => loadPreset(30)}
        >
          Últimos 30 días
        </button>

        <div style={{ marginTop: "15px" }}>
          <input
            type="date"
            value={startDate}
            onChange={(e) =>
              setStartDate(e.target.value)
            }
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) =>
              setEndDate(e.target.value)
            }
            style={{ marginLeft: "10px" }}
          />

          <button
            style={{ marginLeft: "10px" }}
            onClick={() => {
              if (startDate && endDate) {
                setRangeType("custom");
                fetchByRange(startDate, endDate);
              }
            }}
          >
            Aplicar
          </button>
        </div>

        <BarChart
          width={500}
          height={300}
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

        {/* Leyenda */}
        <div style={{ marginTop: "10px" }}>
          <span style={{ color: "#4caf50" }}>
            ● Dentro del 5%
          </span>
          <span
            style={{
              color: "#ff9800",
              marginLeft: "15px",
            }}
          >
            ● Muy por debajo
          </span>
          <span
            style={{
              color: "#f44336",
              marginLeft: "15px",
            }}
          >
            ● Excedido
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;