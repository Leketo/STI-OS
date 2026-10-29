import assert from "node:assert/strict";
import test from "node:test";
import { canMove, canConfirm, canDrop } from "../src/app/app/task-model.ts";
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
