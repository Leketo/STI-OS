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
} from "../src/app/app/task-model.ts";
import { leaveIfSessionEnded } from "../src/app/app/api.ts";
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
test("only administrators can invoice a signed, finished task", () => {
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
  for (const account of [supervisor, tech, client])
    assert.equal(
      canMove(
        { ...task, status: "FINALIZADO", signed: true },
        "FACTURADO",
        account,
      ),
      false,
    );
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
