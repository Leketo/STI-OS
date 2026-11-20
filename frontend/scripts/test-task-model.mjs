import assert from "node:assert/strict";
import test from "node:test";
import {
  canMove,
  canConfirm,
  canDrop,
  canUnassign,
  eventLabel,
  finishesOnRemoval,
  paraguayDate,
  filterPeople,
  passwordProblem,
  phoneProblem,
  visibleStatuses,
  personOptions,
  assignable,
  chooseMobileStage,
  stageOf,
  statusLabel,
  STAGES,
} from "../src/app/app/task-model.ts";
import { leaveIfSessionEnded, signInRefusal } from "../src/app/app/api.ts";
const task = {
  id: "t",
  status: "POR_HACER",
  signed: false,
  pending: 1,
  assignees: [{ id: "assigned", confirmed: false }],
};
const admin = { id: "admin", role: "ADMIN" };
const supervisor = { id: "supervisor", role: "SUPERVISOR" };
const tech = { id: "assigned", role: "USUARIO" };
const client = { id: "client", role: "CLIENTE" };

test("only operators and the assigned technician can start work", () => {
  for (const account of [admin, supervisor, tech])
    assert.equal(canMove(task, "EN_PROCESO", account), true);
  for (const account of [client, { id: "other", role: "USUARIO" }])
    assert.equal(canMove(task, "EN_PROCESO", account), false);
});
test("finishing requires the last outstanding personal confirmation, never a direct status request", () => {
  const working = { ...task, status: "EN_PROCESO" };
  assert.equal(canMove(working, "FINALIZADO", admin), false);
  assert.equal(canDrop(working, "FINALIZADO", admin), false);
  assert.equal(canDrop(working, "FINALIZADO", tech), true);
  assert.equal(canDrop({ ...working, pending: 2 }, "FINALIZADO", tech), false);
  assert.equal(
    canConfirm(
      { ...working, assignees: [{ id: "assigned", confirmed: true }] },
      tech.id,
    ),
    false,
  );
});
test("D-207: administrators and supervisors invoice a signed, finished task", () => {
  for (const status of ["POR_HACER", "EN_PROCESO", "FACTURADO", "ANULADA"])
    assert.equal(
      canMove({ ...task, status, signed: true }, "FACTURADO", admin),
      false,
    );
  assert.equal(
    canMove({ ...task, status: "FINALIZADO" }, "FACTURADO", admin),
    false,
  );
  assert.equal(
    canMove(
      { ...task, status: "FINALIZADO", signed: true },
      "FACTURADO",
      admin,
    ),
    true,
  );
  assert.equal(
    canMove({ ...task, status: "FINALIZADO", signed: true }, "FACTURADO", supervisor),
    true,
  );
  for (const account of [tech, client])
    assert.equal(
      canMove(
        { ...task, status: "FINALIZADO", signed: true },
        "FACTURADO",
        account,
      ),
      false,
    );
});
test("R-23: only operators close a finished task as not billable, with or without a signature", () => {
  for (const signed of [false, true])
    for (const account of [admin, supervisor])
      assert.equal(canMove({ ...task, status: "FINALIZADO", signed }, "NO_FACTURABLE", account), true);
  for (const account of [tech, client])
    assert.equal(canMove({ ...task, status: "FINALIZADO" }, "NO_FACTURABLE", account), false);
  for (const status of ["POR_HACER", "EN_PROCESO", "FACTURADO", "NO_FACTURABLE", "ANULADA"])
    assert.equal(canMove({ ...task, status }, "NO_FACTURABLE", admin), false, status);
  // It needs a reason, so it is never a drop.
  assert.equal(canDrop({ ...task, status: "FINALIZADO" }, "NO_FACTURABLE", admin), false);
});
test("D-209: only operators bring a closed task back to finished, by its button and not by dragging", () => {
  for (const status of ["FACTURADO", "NO_FACTURABLE"]) {
    for (const account of [admin, supervisor])
      assert.equal(canMove({ ...task, status, signed: true }, "FINALIZADO", account), true, status);
    for (const account of [tech, client])
      assert.equal(canMove({ ...task, status }, "FINALIZADO", account), false, status);
    assert.equal(canDrop({ ...task, status }, "FINALIZADO", admin), false, status);
  }
  for (const status of ["POR_HACER", "EN_PROCESO", "ANULADA"])
    assert.equal(canMove({ ...task, status }, "FINALIZADO", admin), false, status);
});
test("rule 7: one column Cerradas holds both closed states, each with its own label", () => {
  assert.equal(STAGES.find((s) => s.status === "FACTURADO").label, "Cerradas");
  assert.equal(stageOf("NO_FACTURABLE"), "FACTURADO");
  assert.equal(stageOf("FACTURADO"), "FACTURADO");
  assert.equal(stageOf("FINALIZADO"), "FINALIZADO");
  assert.equal(statusLabel({ status: "FACTURADO" }), "Facturada");
  assert.equal(statusLabel({ status: "NO_FACTURABLE", closingReason: "USO_INTERNO" }), "No facturable · Uso interno");
  assert.equal(statusLabel({ status: "NO_FACTURABLE", closingReason: "GARANTIA" }), "No facturable · Garantía");
  assert.equal(statusLabel({ status: "FINALIZADO" }), "Finalizadas");
  // On the phone, a board with only a not billable task opens on Cerradas.
  assert.equal(chooseMobileStage([{ status: "NO_FACTURABLE" }], STAGES, null), "FACTURADO");
});
test("the log tells a not billable closing with its reason, and the way back", () => {
  const base = { id: "e", kind: "ESTADO", actorName: "A", occurredAt: "", locationAbsentReason: null };
  assert.equal(
    eventLabel({ ...base, fromStatus: "FINALIZADO", toStatus: "NO_FACTURABLE", closingReason: "GARANTIA" }),
    "Cerró como no facturable · Garantía",
  );
  assert.equal(eventLabel({ ...base, fromStatus: "NO_FACTURABLE", toStatus: "FINALIZADO" }), "Volvió a Finalizadas");
  assert.equal(eventLabel({ ...base, fromStatus: "FACTURADO", toStatus: "FINALIZADO" }), "Volvió a Finalizadas");
  assert.equal(eventLabel({ ...base, fromStatus: "FINALIZADO", toStatus: "FACTURADO" }), "Cambió a facturada");
});
test("backwards movement is restricted to operators and closed tasks cannot be dragged", () => {
  assert.equal(
    canMove({ ...task, status: "EN_PROCESO" }, "POR_HACER", supervisor),
    true,
  );
  assert.equal(
    canMove({ ...task, status: "EN_PROCESO" }, "POR_HACER", tech),
    false,
  );
  assert.equal(
    canMove({ ...task, status: "FINALIZADO" }, "EN_PROCESO", supervisor),
    true,
  );
  for (const status of ["FACTURADO", "ANULADA"])
    for (const to of ["POR_HACER", "EN_PROCESO", "FINALIZADO", "FACTURADO"])
      assert.equal(canDrop({ ...task, status }, to, admin), false);
});

test("mobile initially chooses a populated visible stage instead of an empty first column", async () => {
  const { chooseMobileStage } = await import("../src/app/app/task-model.ts");
  const stages = [
    { status: "POR_HACER" },
    { status: "EN_PROCESO" },
    { status: "FINALIZADO" },
  ];
  assert.equal(
    chooseMobileStage(
      [{ status: "EN_PROCESO" }, { status: "FINALIZADO" }],
      stages,
      null,
    ),
    "EN_PROCESO",
  );
  assert.equal(
    chooseMobileStage([{ status: "FACTURADO" }], stages, null),
    "POR_HACER",
  );
  assert.equal(chooseMobileStage([], stages, null), "POR_HACER");
});

test("mobile respects an explicit empty stage but discards a stage unavailable to the role", async () => {
  const { chooseMobileStage } = await import("../src/app/app/task-model.ts");
  const stages = [{ status: "POR_HACER" }, { status: "EN_PROCESO" }];
  assert.equal(
    chooseMobileStage([{ status: "EN_PROCESO" }], stages, "POR_HACER"),
    "POR_HACER",
  );
  assert.equal(
    chooseMobileStage([{ status: "EN_PROCESO" }], stages, "FACTURADO"),
    "EN_PROCESO",
  );
});
test("D-26 rule 1: a task without assignees offers no way to start it", () => {
  const empty = { ...task, assignees: [], pending: 0 };
  for (const account of [admin, supervisor, tech])
    assert.equal(canMove(empty, "EN_PROCESO", account), false);
  assert.equal(canDrop(empty, "EN_PROCESO", admin), false);
});
test("D-26 rule 3: the last assignee of a task in progress cannot be removed", () => {
  const working = { ...task, status: "EN_PROCESO" };
  assert.equal(canUnassign(working, "assigned"), false);
  assert.equal(canUnassign(task, "assigned"), true);
  const pair = {
    ...working,
    assignees: [
      { id: "assigned", confirmed: true },
      { id: "second", confirmed: false },
    ],
  };
  assert.equal(canUnassign(pair, "second"), true);
  assert.equal(canUnassign(pair, "nobody"), false);
  assert.equal(canUnassign({ ...pair, status: "FINALIZADO" }, "second"), false);
});
test("D-26 rule 2: removing the only pending assignee finishes, and the log says so", () => {
  const pair = {
    ...task,
    status: "EN_PROCESO",
    assignees: [
      { id: "assigned", confirmed: true },
      { id: "second", confirmed: false },
    ],
  };
  assert.equal(finishesOnRemoval(pair, "second"), true);
  assert.equal(finishesOnRemoval(pair, "assigned"), false);
  assert.equal(finishesOnRemoval({ ...pair, status: "POR_HACER" }, "second"), false);
  assert.equal(
    eventLabel({ kind: "ESTADO", toStatus: "FINALIZADO", subjectId: "second" }),
    "Finalizó la tarea al quitar a la única persona pendiente",
  );
  assert.equal(
    eventLabel({ kind: "ESTADO", toStatus: "FINALIZADO", subjectId: null }),
    "Cambió a finalizadas",
  );
});
test("N-15: an ended session sends every read and write to the sign-in screen", () => {
  const visited = [];
  const go = (path) => visited.push(path);
  assert.equal(leaveIfSessionEnded({ status: 401 }, go), true);
  for (const status of [200, 400, 403, 404, 409, 500])
    assert.equal(leaveIfSessionEnded({ status }, go), false);
  assert.deepEqual(visited, ["/login"]);
});
test("N-16: the signature proposes the day in Paraguay at any hour, whatever the device zone", () => {
  const cases = [
    ["2026-11-19T00:37:00Z", "2026-11-18"], // 21:37 in Asunción, the instant of the 18/11 finding
    ["2026-11-19T00:00:00Z", "2026-11-18"], // 21:00
    ["2026-11-19T02:59:59Z", "2026-11-18"], // 23:59:59
    ["2026-11-19T03:00:00Z", "2026-11-19"], // midnight in Asunción
    ["2026-11-18T23:59:00Z", "2026-11-18"], // 20:59
  ];
  const zone = process.env.TZ;
  try {
    for (const deviceZone of ["UTC", "Pacific/Kiritimati", "America/Los_Angeles", "America/Asuncion"]) {
      process.env.TZ = deviceZone;
      for (const [instant, day] of cases)
        assert.equal(paraguayDate(new Date(instant)), day, `${instant} con el dispositivo en ${deviceZone}`);
    }
  } finally {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
  // What the pad proposed before: the UTC day, already tomorrow from 21:00 in Paraguay.
  assert.equal(new Date("2026-11-19T00:37:00Z").toISOString().slice(0, 10), "2026-11-19");
});

// ---------- corte 2 (ENCARGO-DEV-002) ----------
const people = [
  { id: "a", role: "ADMIN", active: true },
  { id: "s", role: "SUPERVISOR", active: false },
  { id: "t", role: "USUARIO", active: true },
  { id: "c", role: "CLIENTE", active: false },
];
test("CA-12: the user list filters by role and by state, combined", () => {
  const ids = (list) => list.map((p) => p.id).join("");
  assert.equal(ids(filterPeople(people, "", "all")), "astc");
  assert.equal(ids(filterPeople(people, "", "active")), "at");
  assert.equal(ids(filterPeople(people, "", "inactive")), "sc");
  assert.equal(ids(filterPeople(people, "CLIENTE", "all")), "c");
  assert.equal(ids(filterPeople(people, "CLIENTE", "active")), "");
  assert.equal(ids(filterPeople(people, "SUPERVISOR", "inactive")), "s");
});
test("rule 3: a new password has 12 characters or more and both fields match", () => {
  assert.match(passwordProblem("once-chars!", "once-chars!"), /12 caracteres/);
  assert.match(passwordProblem("doce-chars-ok", "doce-chars-ok!"), /no coinciden/);
  assert.equal(passwordProblem("doce-chars-ok", "doce-chars-ok"), "");
});
test("rule 7 (D-24): the phone is optional and up to 30 digits, spaces, +, - and parentheses", () => {
  for (const ok of ["", "   ", "+595 (21) 555-0101", "1".repeat(30)])
    assert.equal(phoneProblem(ok), "", ok);
  for (const wrong of ["0981-ABC", "1".repeat(31), "0981;123"])
    assert.notEqual(phoneProblem(wrong), "", wrong);
});
test("D-85: the status filter offers each role only the states it can see", () => {
  const all = ["POR_HACER", "EN_PROCESO", "FINALIZADO", "FACTURADO"];
  // Corte 3A, rule 7: operators also filter by "No facturable".
  assert.deepEqual(visibleStatuses("ADMIN"), [...all, "NO_FACTURABLE"]);
  assert.deepEqual(visibleStatuses("SUPERVISOR"), [...all, "NO_FACTURABLE"]);
  for (const role of ["USUARIO", "CLIENTE"])
    assert.deepEqual(visibleStatuses(role), all.filter((s) => s !== "FACTURADO"), role);
});
test("D-86 and rule 5: only the ADMIN filters by an inactive person, and nobody assigns one", () => {
  const operators = [
    { id: "on", name: "Activa", role: "USUARIO", active: true },
    { id: "off", name: "Inactiva", role: "USUARIO", active: false },
    { id: "old", name: "Sin dato", role: "USUARIO" },
  ];
  assert.deepEqual(personOptions(operators, "ADMIN").map((p) => p.id), ["on", "off", "old"]);
  assert.deepEqual(personOptions(operators, "SUPERVISOR").map((p) => p.id), ["on", "old"]);
  assert.deepEqual(assignable(operators).map((p) => p.id), ["on", "old"]);
});

test("N-45: a 429 from the web server, without the application's JSON, still tells the person to wait", () => {
  const wait = "Demasiados intentos. Esperá un minuto y probá de nuevo.";
  assert.equal(signInRefusal(429, null), wait);
  assert.equal(signInRefusal(429, {}), wait);
  assert.equal(signInRefusal(429, { message: "" }), wait);
  assert.equal(signInRefusal(429, { message: "Probá de nuevo en 10 minutos." }), "Probá de nuevo en 10 minutos.");
  assert.equal(signInRefusal(401, null), "Correo o contraseña incorrectos.");
  assert.equal(signInRefusal(500, null), "No se pudo iniciar sesión.");
});

// Corte 3A (R-20, R-22): full-screen signature.
import { fit, toArea, toReference, dataUrlBytes, exportWidths, firstThatFits, MAX_SIGNATURE_BYTES } from "../src/app/app/signature-geometry.ts";
test("turning the phone keeps the strokes: one uniform scale, centred, and back without loss", () => {
  const portrait = { width: 358, height: 420 };
  const landscape = { width: 560, height: 300 };
  const f = fit(portrait, landscape);
  assert.equal(f.scale, 300 / 420);
  assert.equal(f.offsetY, 0);
  assert.ok(f.offsetX > 0);
  const p = { x: 120, y: 200 };
  const back = toReference(toArea(p, f), f);
  assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9);
  // The same area is the identity.
  assert.deepEqual(fit(portrait, portrait), { scale: 1, offsetX: 0, offsetY: 0 });
});
test("point 14: an image over 1 MiB lowers its resolution, never the limit", () => {
  assert.equal(MAX_SIGNATURE_BYTES, 1048576);
  assert.equal(dataUrlBytes("data:image/png;base64,QUJD"), 3);
  assert.equal(dataUrlBytes("data:image/png;base64,QUI="), 2);
  const widths = exportWidths();
  assert.equal(widths[0], 1600);
  assert.equal(widths.at(-1), 400);
  for (let i = 1; i < widths.length; i++) assert.ok(widths[i] < widths[i - 1]);
  // A renderer whose image weighs 1000 bytes per pixel of width: 1600 and 1200 do not fit, 900 does.
  const tried = [];
  const image = firstThatFits((w) => { tried.push(w); return "data:image/png;base64," + "A".repeat(Math.ceil((w * 1000 * 4) / 3)); });
  assert.deepEqual(tried, [1600, 1200, 900]);
  assert.ok(dataUrlBytes(image) <= MAX_SIGNATURE_BYTES);
  assert.equal(firstThatFits(() => "data:image/png;base64," + "A".repeat(2_000_000)), null);
});
