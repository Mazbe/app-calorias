import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const CATEGORIES = [
  "Pecho", "Hombros", "Tríceps", "Espalda", "Bíceps",
  "Antebrazos", "Cuádriceps", "Isquiotibiales", "Glúteos", "Abdominales",
];

const KG_TO_LBS = 2.20462;

const C = {
  bg: "#0d0d14",
  card: "#13131f",
  border: "#1e1e30",
  border2: "#2a2a40",
  text: "#e8e8f0",
  muted: "#444",
  muted2: "#555",
  green: "#00e096",
  amber: "#ffab00",
  red: "#ff4d4d",
  purple: "#a78bfa",
};

function getLocalDate() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const p = fmt.formatToParts(new Date());
  return `${p.find(x => x.type === "year").value}-${p.find(x => x.type === "month").value}-${p.find(x => x.type === "day").value}`;
}

function daysAgo(n) {
  const d = new Date(getLocalDate() + "T00:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function convertWeight(val, fromUnit) {
  const n = Number(val) || 0;
  const kg = fromUnit === "kg" ? n : Math.round((n / KG_TO_LBS) * 100) / 100;
  const lbs = fromUnit === "lbs" ? n : Math.round(n * KG_TO_LBS * 100) / 100;
  return { kg, lbs };
}

function emptySet() {
  return { reps: "", weight: "", unit: "kg" };
}

export default function WorkoutPage() {
  const [tab, setTab] = useState("ejercicios");

  // ── Exercises ──
  const [exercises, setExercises] = useState([]);
  const [showNewEx, setShowNewEx] = useState(false);
  const [newExName, setNewExName] = useState("");
  const [newExCat, setNewExCat] = useState(CATEGORIES[0]);
  const [exError, setExError] = useState("");

  // ── Workouts list ──
  const [workouts, setWorkouts] = useState([]);

  // ── Planning ──
  // null = list view | { name, blocks: [{exercise, sets:[{reps,weight,unit}]}] }
  const [planning, setPlanning] = useState(null);
  const [showExPicker, setShowExPicker] = useState(false);

  // ── Active workout ──
  // null | { workout, blocks: [{workout_exercise_id, exercise, position, sets:[{reps,weight_input,unit_input}]}] }
  const [activeWorkout, setActiveWorkout] = useState(null);

  // ── Export ──
  const [expRange, setExpRange] = useState("7");
  const [expStart, setExpStart] = useState("");
  const [expEnd, setExpEnd] = useState("");

  useEffect(() => {
    fetchExercises();
    fetchWorkouts();
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // DB: Exercises
  // ───────────────────────────────────────────────────────────────────────────
  async function fetchExercises() {
    const { data } = await supabase.from("exercises").select("*").order("name");
    if (data) setExercises(data);
  }

  async function createExercise() {
    if (!newExName.trim()) return;
    setExError("");
    const { error } = await supabase
      .from("exercises")
      .insert([{ name: newExName.trim(), category: newExCat }]);
    if (error) { setExError("Error guardando: " + error.message); return; }
    setNewExName("");
    setNewExCat(CATEGORIES[0]);
    setShowNewEx(false);
    fetchExercises();
  }

  async function deleteExercise(id) {
    setExError("");
    const { error } = await supabase.from("exercises").delete().eq("id", id);
    if (error) {
      setExError("No se puede eliminar: está en uso en algún entrenamiento.");
      return;
    }
    fetchExercises();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DB: Workouts
  // ───────────────────────────────────────────────────────────────────────────
  async function fetchWorkouts() {
    const { data } = await supabase
      .from("workouts")
      .select("*")
      .order("planned_at", { ascending: false });
    if (data) setWorkouts(data);
  }

  async function createWorkout() {
    if (!planning?.name?.trim() || !planning.blocks?.length) return;

    const { data: wo, error: woErr } = await supabase
      .from("workouts")
      .insert([{ name: planning.name.trim(), status: "PLANNED", planned_at: new Date().toISOString() }])
      .select()
      .single();
    if (woErr) { console.error(woErr); return; }

    for (let i = 0; i < planning.blocks.length; i++) {
      const block = planning.blocks[i];
      const { data: we, error: weErr } = await supabase
        .from("workout_exercises")
        .insert([{ workout_id: wo.id, exercise_id: block.exercise.id, position: i }])
        .select()
        .single();
      if (weErr) { console.error(weErr); continue; }

      for (let j = 0; j < block.sets.length; j++) {
        const s = block.sets[j];
        const { kg, lbs } = convertWeight(s.weight, s.unit);
        await supabase.from("sets").insert([{
          workout_exercise_id: we.id,
          set_number: j + 1,
          reps: Number(s.reps) || 0,
          weight_input: Number(s.weight) || 0,
          unit_input: s.unit,
          weight_kg: kg,
          weight_lbs: lbs,
        }]);
      }
    }

    setPlanning(null);
    setShowExPicker(false);
    fetchWorkouts();
    setTab("entrenamientos");
  }

  async function deleteWorkout(id, e) {
    e.stopPropagation();
    await supabase.from("workouts").delete().eq("id", id);
    fetchWorkouts();
  }

  async function loadWorkoutForExecution(workoutId) {
    const { data: wo } = await supabase
      .from("workouts").select("*").eq("id", workoutId).single();
    const { data: wes } = await supabase
      .from("workout_exercises")
      .select("*, exercises(*), sets(*)")
      .eq("workout_id", workoutId)
      .order("position");

    const blocks = (wes || []).map(we => ({
      workout_exercise_id: we.id,
      exercise: we.exercises,
      position: we.position,
      sets: (we.sets || [])
        .sort((a, b) => a.set_number - b.set_number)
        .map(s => ({
          reps: String(s.reps),
          weight_input: String(s.weight_input),
          unit_input: s.unit_input,
        })),
    }));

    setActiveWorkout({ workout: wo, blocks });
    setTab("activo");
  }

  async function finalizeWorkout() {
    if (!activeWorkout) return;

    const weIds = activeWorkout.blocks.map(b => b.workout_exercise_id);
    await supabase.from("sets").delete().in("workout_exercise_id", weIds);

    for (const block of activeWorkout.blocks) {
      for (let j = 0; j < block.sets.length; j++) {
        const s = block.sets[j];
        const { kg, lbs } = convertWeight(s.weight_input, s.unit_input);
        await supabase.from("sets").insert([{
          workout_exercise_id: block.workout_exercise_id,
          set_number: j + 1,
          reps: Number(s.reps) || 0,
          weight_input: Number(s.weight_input) || 0,
          unit_input: s.unit_input,
          weight_kg: kg,
          weight_lbs: lbs,
        }]);
      }
    }

    await supabase
      .from("workouts")
      .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
      .eq("id", activeWorkout.workout.id);

    setActiveWorkout(null);
    fetchWorkouts();
    setTab("entrenamientos");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Export
  // ───────────────────────────────────────────────────────────────────────────
  async function handleExport() {
    const from = expRange === "custom" ? expStart
      : expRange === "7" ? daysAgo(7)
      : daysAgo(30);
    const to = expRange === "custom" ? expEnd : getLocalDate();
    if (!from || !to) return;

    const { data: wos } = await supabase
      .from("workouts")
      .select(`id, name, completed_at,
        workout_exercises(position, exercises(name, category),
          sets(set_number, reps, weight_kg, weight_lbs, unit_input))`)
      .eq("status", "COMPLETED")
      .gte("completed_at", from + "T00:00:00")
      .lte("completed_at", to + "T23:59:59")
      .order("completed_at");

    if (!wos) return;

    const allCategories = [
      ...new Set(
        wos.flatMap(w =>
          (w.workout_exercises || []).map(we => we.exercises?.category).filter(Boolean)
        )
      ),
    ];

    const exportData = {
      export_date: new Date().toISOString(),
      range: { from, to },
      summary: {
        total_workouts: wos.length,
        total_sets: wos.reduce(
          (s, w) => s + (w.workout_exercises || []).reduce((ss, we) => ss + (we.sets || []).length, 0),
          0
        ),
        categories_trained: allCategories,
      },
      workouts: wos.map(w => ({
        id: w.id,
        name: w.name,
        completed_at: w.completed_at,
        exercises: (w.workout_exercises || [])
          .sort((a, b) => a.position - b.position)
          .map(we => ({
            position: we.position + 1,
            exercise_name: we.exercises?.name,
            category: we.exercises?.category,
            sets: (we.sets || [])
              .sort((a, b) => a.set_number - b.set_number)
              .map(s => ({
                set_number: s.set_number,
                reps: s.reps,
                weight_kg: s.weight_kg,
                weight_lbs: s.weight_lbs,
                unit_input: s.unit_input,
              })),
          })),
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `entrenamientos_${getLocalDate()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Styles
  // ───────────────────────────────────────────────────────────────────────────
  const S = {
    card: {
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: "16px", padding: "20px", marginBottom: "16px",
    },
    label: {
      fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase",
      color: C.muted, marginBottom: "12px",
    },
    input: {
      background: C.bg, border: `1px solid ${C.border2}`, borderRadius: "10px",
      color: C.text, fontFamily: "'DM Mono', monospace", fontSize: "15px",
      padding: "10px 14px", width: "100%", boxSizing: "border-box", outline: "none",
    },
    smallInput: {
      background: C.bg, border: `1px solid ${C.border2}`, borderRadius: "8px",
      color: C.text, fontFamily: "'DM Mono', monospace", fontSize: "14px",
      padding: "8px 10px", outline: "none", textAlign: "center",
      width: "100%", boxSizing: "border-box",
    },
    select: {
      background: C.bg, border: `1px solid ${C.border2}`, borderRadius: "10px",
      color: C.text, fontFamily: "'DM Mono', monospace", fontSize: "14px",
      padding: "10px 14px", width: "100%", boxSizing: "border-box",
      outline: "none", appearance: "none", WebkitAppearance: "none",
    },
    btnPrimary: {
      background: C.green, color: C.bg, border: "none", borderRadius: "10px",
      padding: "12px 24px", fontFamily: "'DM Mono', monospace", fontSize: "13px",
      fontWeight: 700, letterSpacing: "2px", cursor: "pointer", textTransform: "uppercase",
    },
    btnSecondary: (active) => ({
      background: active ? "#1e1e2e" : "transparent",
      color: active ? C.text : C.muted,
      border: `1px solid ${active ? C.border2 : C.border}`,
      borderRadius: "8px", padding: "8px 14px",
      fontFamily: "'DM Mono', monospace", fontSize: "11px",
      letterSpacing: "2px", cursor: "pointer", textTransform: "uppercase",
    }),
    btnDanger: {
      background: "transparent", border: `1px solid ${C.red}44`, color: C.red,
      borderRadius: "8px", padding: "10px 20px", fontFamily: "'DM Mono', monospace",
      fontSize: "12px", letterSpacing: "1px", cursor: "pointer", textTransform: "uppercase",
    },
    iconBtn: {
      background: "transparent", border: "none", cursor: "pointer",
      padding: "6px 10px", lineHeight: 1, fontSize: "20px",
    },
  };

  const TABS = [
    { id: "ejercicios", label: "Ejercicios" },
    { id: "entrenamientos", label: "Planes" },
    { id: "activo", label: "Activo" },
    { id: "exportar", label: "Exportar" },
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // Set row (shared between planning and active)
  // ───────────────────────────────────────────────────────────────────────────
  function SetRow({ index, reps, weight, unit, canRemove, onReps, onWeight, onUnit, onRemove }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
        <div style={{ color: C.muted, fontSize: "11px", width: "18px", flexShrink: 0, textAlign: "right" }}>
          {index + 1}
        </div>
        <input
          style={{ ...S.smallInput, width: "56px", flexShrink: 0 }}
          placeholder="Reps"
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={e => onReps(e.target.value)}
        />
        <span style={{ color: C.muted, fontSize: "12px", flexShrink: 0 }}>×</span>
        <input
          style={{ ...S.smallInput, flex: 1, minWidth: 0 }}
          placeholder="Peso"
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={e => onWeight(e.target.value)}
        />
        <button
          onClick={onUnit}
          style={{
            ...S.btnSecondary(false),
            padding: "8px 10px", fontSize: "10px",
            minWidth: "42px", flexShrink: 0, textAlign: "center",
          }}
        >
          {unit}
        </button>
        {canRemove && (
          <button onClick={onRemove} style={{ ...S.iconBtn, color: C.muted, fontSize: "18px" }}>
            −
          </button>
        )}
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      color: C.text,
      fontFamily: "'DM Mono', 'Courier New', monospace",
      padding: "32px 20px 80px",
      maxWidth: "720px",
      margin: "0 auto",
    }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ fontSize: "13px", letterSpacing: "6px", textTransform: "uppercase", color: C.muted2, marginBottom: "4px" }}>
          Workout Tracker
        </div>
        <div style={{ fontSize: "clamp(40px, 9vw, 70px)", fontWeight: 700, letterSpacing: "-2px", lineHeight: 1, color: C.purple, fontFamily: "'DM Mono', monospace" }}>
          Entrena
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", background: C.card, borderRadius: "12px", padding: "4px" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: "10px 2px", borderRadius: "8px", border: "none",
              background: tab === t.id ? "#1e1e2e" : "transparent",
              color: tab === t.id ? C.text : C.muted,
              fontFamily: "'DM Mono', monospace", fontSize: "9px",
              letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Tab: Ejercicios                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === "ejercicios" && (
        <div>
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ ...S.label, marginBottom: 0 }}>Biblioteca</div>
              <button onClick={() => { setShowNewEx(v => !v); setExError(""); }} style={S.btnSecondary(showNewEx)}>
                {showNewEx ? "Cancelar" : "+ Nuevo"}
              </button>
            </div>

            {showNewEx && (
              <div style={{ marginBottom: "16px", padding: "16px", background: C.bg, borderRadius: "10px", border: `1px solid ${C.border2}` }}>
                <input
                  style={{ ...S.input, marginBottom: "10px" }}
                  placeholder="Nombre del ejercicio"
                  value={newExName}
                  onChange={e => setNewExName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createExercise()}
                />
                {/* Select wrapper with custom arrow */}
                <div style={{ position: "relative", marginBottom: "10px" }}>
                  <select value={newExCat} onChange={e => setNewExCat(e.target.value)} style={S.select}>
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <span style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none", fontSize: "12px" }}>▾</span>
                </div>
                <button onClick={createExercise} style={{ ...S.btnPrimary, width: "100%" }}>
                  Guardar ejercicio
                </button>
              </div>
            )}

            {exError && (
              <div style={{ color: C.red, fontSize: "12px", marginBottom: "12px", letterSpacing: "0.5px" }}>
                {exError}
              </div>
            )}

            {exercises.length === 0 && !showNewEx && (
              <div style={{ color: C.muted2, fontSize: "13px", textAlign: "center", padding: "24px 0" }}>
                Sin ejercicios. Agrega uno arriba.
              </div>
            )}

            {exercises.map((ex, i) => (
              <div
                key={ex.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 0",
                  borderBottom: i < exercises.length - 1 ? `1px solid ${C.border}` : "none",
                }}
              >
                <div>
                  <div style={{ color: C.text, fontSize: "14px" }}>{ex.name}</div>
                  <div style={{ color: C.purple, fontSize: "10px", letterSpacing: "2px", marginTop: "2px" }}>{ex.category}</div>
                </div>
                <button onClick={() => deleteExercise(ex.id)} style={{ ...S.iconBtn, color: C.red + "99" }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Tab: Entrenamientos                                                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === "entrenamientos" && (
        <div>
          {planning === null ? (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
                <button
                  onClick={() => setPlanning({ name: "", blocks: [] })}
                  style={{ ...S.btnSecondary(false), padding: "10px 18px" }}
                >
                  + Nuevo plan
                </button>
              </div>

              {workouts.length === 0 && (
                <div style={S.card}>
                  <div style={{ color: C.muted2, fontSize: "13px", textAlign: "center", padding: "24px 0" }}>
                    Sin entrenamientos. Crea un plan arriba.
                  </div>
                </div>
              )}

              {workouts.map(wo => (
                <div
                  key={wo.id}
                  style={{
                    ...S.card,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    cursor: wo.status === "PLANNED" ? "pointer" : "default",
                    borderColor: wo.status === "PLANNED" ? C.border2 : C.border,
                    marginBottom: "10px",
                  }}
                  onClick={() => wo.status === "PLANNED" && loadWorkoutForExecution(wo.id)}
                >
                  <div style={{ flex: 1, minWidth: 0, marginRight: "12px" }}>
                    <div style={{ color: C.text, fontSize: "15px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {wo.name}
                    </div>
                    <div style={{ color: C.muted2, fontSize: "10px", marginTop: "4px", letterSpacing: "1px" }}>
                      {(wo.status === "COMPLETED" ? wo.completed_at : wo.planned_at)?.slice(0, 10)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    <div style={{
                      padding: "4px 10px", borderRadius: "20px", fontSize: "9px",
                      letterSpacing: "1px", textTransform: "uppercase",
                      background: wo.status === "PLANNED" ? C.amber + "22" : C.green + "22",
                      color: wo.status === "PLANNED" ? C.amber : C.green,
                    }}>
                      {wo.status === "PLANNED" ? "Planificado" : "Completado"}
                    </div>
                    {wo.status === "PLANNED" && (
                      <button
                        onClick={e => deleteWorkout(wo.id, e)}
                        style={{ ...S.iconBtn, color: C.red + "88", fontSize: "18px" }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : (
            /* ─── Planning form ─── */
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <div style={{ ...S.label, marginBottom: 0 }}>Nuevo plan</div>
                <button onClick={() => { setPlanning(null); setShowExPicker(false); }} style={S.btnSecondary(false)}>
                  Cancelar
                </button>
              </div>

              {/* Workout name */}
              <div style={S.card}>
                <div style={S.label}>Nombre del entrenamiento</div>
                <input
                  style={S.input}
                  placeholder="Ej: Pecho y hombros"
                  value={planning.name}
                  onChange={e => setPlanning(p => ({ ...p, name: e.target.value }))}
                />
              </div>

              {/* Exercise blocks */}
              {planning.blocks.map((block, bi) => (
                <div key={bi} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                    <div>
                      <div style={{ color: C.text, fontSize: "14px", fontWeight: 700 }}>{block.exercise.name}</div>
                      <div style={{ color: C.purple, fontSize: "10px", letterSpacing: "2px", marginTop: "2px" }}>{block.exercise.category}</div>
                    </div>
                    <button
                      onClick={() => setPlanning(p => ({ ...p, blocks: p.blocks.filter((_, i) => i !== bi) }))}
                      style={{ ...S.iconBtn, color: C.red + "88" }}
                    >
                      ×
                    </button>
                  </div>

                  {block.sets.map((set, si) => (
                    <SetRow
                      key={si}
                      index={si}
                      reps={set.reps}
                      weight={set.weight}
                      unit={set.unit}
                      canRemove={block.sets.length > 1}
                      onReps={v => setPlanning(p => {
                        const blocks = p.blocks.map((b, i) => i !== bi ? b : {
                          ...b, sets: b.sets.map((s, j) => j !== si ? s : { ...s, reps: v }),
                        });
                        return { ...p, blocks };
                      })}
                      onWeight={v => setPlanning(p => {
                        const blocks = p.blocks.map((b, i) => i !== bi ? b : {
                          ...b, sets: b.sets.map((s, j) => j !== si ? s : { ...s, weight: v }),
                        });
                        return { ...p, blocks };
                      })}
                      onUnit={() => setPlanning(p => {
                        const blocks = p.blocks.map((b, i) => i !== bi ? b : {
                          ...b, sets: b.sets.map((s, j) => j !== si ? s : { ...s, unit: s.unit === "kg" ? "lbs" : "kg" }),
                        });
                        return { ...p, blocks };
                      })}
                      onRemove={() => setPlanning(p => {
                        const blocks = p.blocks.map((b, i) => i !== bi ? b : {
                          ...b, sets: b.sets.filter((_, j) => j !== si),
                        });
                        return { ...p, blocks };
                      })}
                    />
                  ))}

                  <button
                    onClick={() => setPlanning(p => {
                      const blocks = p.blocks.map((b, i) => i !== bi ? b : {
                        ...b, sets: [...b.sets, emptySet()],
                      });
                      return { ...p, blocks };
                    })}
                    style={{ ...S.btnSecondary(false), marginTop: "6px", width: "100%", textAlign: "center" }}
                  >
                    + Set
                  </button>
                </div>
              ))}

              {/* Exercise picker */}
              {showExPicker ? (
                <div style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ ...S.label, marginBottom: 0 }}>Seleccionar ejercicio</div>
                    <button onClick={() => setShowExPicker(false)} style={S.btnSecondary(false)}>Cancelar</button>
                  </div>
                  {exercises.length === 0 && (
                    <div style={{ color: C.muted2, fontSize: "13px", textAlign: "center", padding: "16px 0" }}>
                      Ve a Ejercicios y agrega algunos primero.
                    </div>
                  )}
                  {exercises.map(ex => (
                    <div
                      key={ex.id}
                      onClick={() => {
                        setPlanning(p => ({
                          ...p,
                          blocks: [...p.blocks, { exercise: ex, sets: [emptySet()] }],
                        }));
                        setShowExPicker(false);
                      }}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "12px", borderRadius: "10px", marginBottom: "6px",
                        background: C.bg, cursor: "pointer", border: `1px solid ${C.border}`,
                      }}
                    >
                      <div>
                        <div style={{ color: C.text, fontSize: "14px" }}>{ex.name}</div>
                        <div style={{ color: C.purple, fontSize: "10px", letterSpacing: "1px", marginTop: "2px" }}>{ex.category}</div>
                      </div>
                      <span style={{ color: C.muted, fontSize: "20px" }}>›</span>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => setShowExPicker(true)}
                  style={{ ...S.btnSecondary(false), width: "100%", padding: "14px", textAlign: "center", marginBottom: "16px" }}
                >
                  + Agregar ejercicio
                </button>
              )}

              {!showExPicker && planning.blocks.length > 0 && (
                <button
                  onClick={createWorkout}
                  style={{ ...S.btnPrimary, width: "100%", padding: "14px" }}
                >
                  Guardar plan
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Tab: Activo                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === "activo" && (
        <div>
          {activeWorkout === null ? (
            <>
              <div style={{ ...S.label, marginBottom: "16px" }}>Seleccionar entrenamiento</div>
              {workouts.filter(w => w.status === "PLANNED").length === 0 && (
                <div style={S.card}>
                  <div style={{ color: C.muted2, fontSize: "13px", textAlign: "center", padding: "24px 0" }}>
                    Sin entrenamientos planificados.<br />
                    <span style={{ color: C.muted }}>Crea uno en la pestaña Planes.</span>
                  </div>
                </div>
              )}
              {workouts
                .filter(w => w.status === "PLANNED")
                .map(wo => (
                  <div
                    key={wo.id}
                    style={{ ...S.card, cursor: "pointer", borderColor: C.border2 }}
                    onClick={() => loadWorkoutForExecution(wo.id)}
                  >
                    <div style={{ color: C.text, fontSize: "15px" }}>{wo.name}</div>
                    <div style={{ color: C.muted2, fontSize: "10px", marginTop: "4px" }}>
                      {wo.planned_at?.slice(0, 10)} · Toca para iniciar
                    </div>
                  </div>
                ))}
            </>
          ) : (
            <>
              {/* Active workout header */}
              <div style={{ ...S.card, borderColor: C.amber + "66" }}>
                <div style={S.label}>En curso</div>
                <div style={{ color: C.text, fontSize: "20px", fontWeight: 700 }}>{activeWorkout.workout.name}</div>
              </div>

              {/* Blocks */}
              {activeWorkout.blocks.map((block, bi) => (
                <div key={bi} style={S.card}>
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ color: C.text, fontSize: "14px", fontWeight: 700 }}>{block.exercise.name}</div>
                    <div style={{ color: C.purple, fontSize: "10px", letterSpacing: "2px", marginTop: "2px" }}>{block.exercise.category}</div>
                  </div>

                  {block.sets.map((set, si) => (
                    <SetRow
                      key={si}
                      index={si}
                      reps={set.reps}
                      weight={set.weight_input}
                      unit={set.unit_input}
                      canRemove={block.sets.length > 1}
                      onReps={v => setActiveWorkout(aw => ({
                        ...aw,
                        blocks: aw.blocks.map((b, i) => i !== bi ? b : {
                          ...b, sets: b.sets.map((s, j) => j !== si ? s : { ...s, reps: v }),
                        }),
                      }))}
                      onWeight={v => setActiveWorkout(aw => ({
                        ...aw,
                        blocks: aw.blocks.map((b, i) => i !== bi ? b : {
                          ...b, sets: b.sets.map((s, j) => j !== si ? s : { ...s, weight_input: v }),
                        }),
                      }))}
                      onUnit={() => setActiveWorkout(aw => ({
                        ...aw,
                        blocks: aw.blocks.map((b, i) => i !== bi ? b : {
                          ...b, sets: b.sets.map((s, j) => j !== si ? s : { ...s, unit_input: s.unit_input === "kg" ? "lbs" : "kg" }),
                        }),
                      }))}
                      onRemove={() => setActiveWorkout(aw => ({
                        ...aw,
                        blocks: aw.blocks.map((b, i) => i !== bi ? b : {
                          ...b, sets: b.sets.filter((_, j) => j !== si),
                        }),
                      }))}
                    />
                  ))}

                  <button
                    onClick={() => setActiveWorkout(aw => ({
                      ...aw,
                      blocks: aw.blocks.map((b, i) => i !== bi ? b : {
                        ...b, sets: [...b.sets, { reps: "", weight_input: "", unit_input: "kg" }],
                      }),
                    }))}
                    style={{ ...S.btnSecondary(false), marginTop: "6px", width: "100%", textAlign: "center" }}
                  >
                    + Set
                  </button>
                </div>
              ))}

              {/* Finalize */}
              <button
                onClick={finalizeWorkout}
                style={{ ...S.btnPrimary, width: "100%", padding: "16px", marginTop: "8px" }}
              >
                Finalizar entrenamiento
              </button>
              <button
                onClick={() => setActiveWorkout(null)}
                style={{ ...S.btnDanger, width: "100%", padding: "12px", marginTop: "10px", textAlign: "center" }}
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Tab: Exportar                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === "exportar" && (
        <div>
          <div style={S.card}>
            <div style={S.label}>Rango de exportación</div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
              {[
                ["7", "Últimos 7 días"],
                ["30", "Últimos 30 días"],
                ["custom", "Personalizado"],
              ].map(([val, label]) => (
                <button key={val} onClick={() => setExpRange(val)} style={{ ...S.btnSecondary(expRange === val) }}>
                  {label}
                </button>
              ))}
            </div>

            {expRange === "custom" && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={expStart}
                  onChange={e => setExpStart(e.target.value)}
                  style={{
                    ...S.input, fontSize: "13px", flex: 1, minWidth: "130px",
                    colorScheme: "dark",
                  }}
                />
                <span style={{ color: C.muted, fontSize: "12px" }}>→</span>
                <input
                  type="date"
                  value={expEnd}
                  onChange={e => setExpEnd(e.target.value)}
                  style={{
                    ...S.input, fontSize: "13px", flex: 1, minWidth: "130px",
                    colorScheme: "dark",
                  }}
                />
              </div>
            )}

            <button onClick={handleExport} style={{ ...S.btnPrimary, width: "100%" }}>
              Descargar JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
