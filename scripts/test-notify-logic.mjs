#!/usr/bin/env node
/*
 * Test unitario de la lógica pura de notify-deadlines.
 * Reimplementa diffDays / DIFF_TO_KIND / buildSubject (mismas funciones
 * que la edge function Deno) y verifica casos límite.
 *
 * Uso: node scripts/test-notify-logic.mjs
 * Exit code 0 = OK, 1 = fail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- código bajo prueba (copia 1:1 de la edge function) ---
const DIFF_TO_KIND = {
  5: '5d', 3: '3d', 1: '1d', 0: 'due',
  [-1]: 'overdue+1', [-3]: 'overdue+3', [-7]: 'overdue+7', [-14]: 'overdue+14', [-30]: 'overdue+30',
};

function diffDays(yyyyMmDd, today) {
  const due = new Date(yyyyMmDd + 'T00:00:00Z');
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.round((due.getTime() - todayUTC.getTime()) / 86400000);
}

function buildSubject(kind, title) {
  if (kind === 'due') return `Hoy vence: ${title}`;
  if (kind.startsWith('overdue+')) return `Vencido hace ${kind.replace('overdue+', '')} día(s): ${title}`;
  return `Faltan ${kind.replace('d', '')} día(s) para entregar: ${title}`;
}

// --- helpers ---
const TODAY = new Date('2026-05-12T10:00:00Z');
function inDays(n) {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// --- tests ---
test('diffDays: hoy mismo → 0', () => {
  assert.equal(diffDays(inDays(0), TODAY), 0);
});

test('diffDays: 5 días en el futuro → 5', () => {
  assert.equal(diffDays(inDays(5), TODAY), 5);
});

test('diffDays: 1 día en el pasado → -1', () => {
  assert.equal(diffDays(inDays(-1), TODAY), -1);
});

test('diffDays: 30 días en el pasado → -30', () => {
  assert.equal(diffDays(inDays(-30), TODAY), -30);
});

test('DIFF_TO_KIND mapea 5d/3d/1d/due', () => {
  assert.equal(DIFF_TO_KIND[5], '5d');
  assert.equal(DIFF_TO_KIND[3], '3d');
  assert.equal(DIFF_TO_KIND[1], '1d');
  assert.equal(DIFF_TO_KIND[0], 'due');
});

test('DIFF_TO_KIND mapea overdue+1/3/7/14/30', () => {
  assert.equal(DIFF_TO_KIND[-1], 'overdue+1');
  assert.equal(DIFF_TO_KIND[-3], 'overdue+3');
  assert.equal(DIFF_TO_KIND[-7], 'overdue+7');
  assert.equal(DIFF_TO_KIND[-14], 'overdue+14');
  assert.equal(DIFF_TO_KIND[-30], 'overdue+30');
});

test('DIFF_TO_KIND: días no clave → undefined (no dispara email)', () => {
  assert.equal(DIFF_TO_KIND[2], undefined);
  assert.equal(DIFF_TO_KIND[4], undefined);
  assert.equal(DIFF_TO_KIND[10], undefined);
  assert.equal(DIFF_TO_KIND[-2], undefined);
  assert.equal(DIFF_TO_KIND[-5], undefined);
  assert.equal(DIFF_TO_KIND[-100], undefined);
});

test('buildSubject: kind 5d', () => {
  assert.equal(buildSubject('5d', 'Antonia Villa'), 'Faltan 5 día(s) para entregar: Antonia Villa');
});

test('buildSubject: kind due', () => {
  assert.equal(buildSubject('due', 'CakeMedic'), 'Hoy vence: CakeMedic');
});

test('buildSubject: kind overdue+7', () => {
  assert.equal(buildSubject('overdue+7', 'Gintracom'), 'Vencido hace 7 día(s): Gintracom');
});

test('Flujo completo: proyecto con fin a 5 días → kind=5d', () => {
  const project = { title: 'Test', projected_end_date: inDays(5) };
  const d = diffDays(project.projected_end_date, TODAY);
  const kind = DIFF_TO_KIND[d];
  assert.equal(kind, '5d');
  assert.equal(buildSubject(kind, project.title), 'Faltan 5 día(s) para entregar: Test');
});

test('Flujo completo: proyecto vencido hace 14 días → kind=overdue+14', () => {
  const project = { title: 'Atrasado', projected_end_date: inDays(-14) };
  const kind = DIFF_TO_KIND[diffDays(project.projected_end_date, TODAY)];
  assert.equal(kind, 'overdue+14');
});

test('Flujo completo: proyecto a 7 días → NO dispara (silencio entre 5 y 3)', () => {
  const project = { projected_end_date: inDays(7) };
  const kind = DIFF_TO_KIND[diffDays(project.projected_end_date, TODAY)];
  assert.equal(kind, undefined);
});

test('Flujo completo: proyecto vencido hace 100 días → NO dispara (fuera de ventana)', () => {
  const project = { projected_end_date: inDays(-100) };
  const kind = DIFF_TO_KIND[diffDays(project.projected_end_date, TODAY)];
  assert.equal(kind, undefined);
});

test('Email regex: válidos pasan', () => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  assert.ok(re.test('m.cuevas@pancake.lat'));
  assert.ok(re.test('foo+tag@bar.co'));
  assert.ok(re.test('a@b.c'));
});

test('Email regex: inválidos rechazan', () => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  assert.ok(!re.test(''));
  assert.ok(!re.test('sin-arroba'));
  assert.ok(!re.test('sin@dominio'));
  assert.ok(!re.test('espacio @bad.com'));
});
