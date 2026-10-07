// Iqra Quran's rules on PC must match qurankit's (Hifz.kt, Qaida.kt, Quran.kt) and their tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Q from '../src/ui/quran.js';

const item = (o) => ({ surah: 1, from: 1, to: 7, learnedOn: 100, lastReview: 100, level: 0, weak: false, ...o });

test('Hifz groups: Sabaq today, Sabqi for a week, then Manzil', () => {
  assert.equal(Q.group(item(), 100), 'Sabaq');
  assert.equal(Q.group(item(), 101), 'Sabqi');
  assert.equal(Q.group(item(), 107), 'Sabqi');
  assert.equal(Q.group(item(), 108), 'Manzil');
});

test('Hifz revision is due daily at first, then on a growing schedule', () => {
  assert.equal(Q.isDue(item(), 100), false, 'not again on the day it was learned');
  assert.equal(Q.isDue(item(), 101), true, 'Sabqi is daily');
  // Manzil at level 3 waits 7 days after the last revision.
  const old = item({ learnedOn: 10, lastReview: 95, level: 3 });
  assert.equal(Q.isDue(old, 101), false);
  assert.equal(Q.isDue(old, 102), true);
  assert.equal(Q.isDue({ ...old, weak: true }, 96), true, 'weak passages come back every day');
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 9].map(Q.interval), [1, 2, 4, 7, 14, 21, 30, 30]);
});

test('a good revision moves the next one out, a weak one brings it back', () => {
  const good = Q.reviewed(item({ level: 2, weak: true }), 120, true);
  assert.deepEqual([good.lastReview, good.level, good.weak], [120, 3, false]);
  const weak = Q.reviewed(item({ level: 3 }), 120, false);
  assert.deepEqual([weak.lastReview, weak.level, weak.weak], [120, 1, true]);
  assert.equal(Q.reviewed(item({ level: 1 }), 120, false).level, 0);
});

test('the Hifz plan repeats each ayah, then the whole passage', () => {
  const steps = Q.plan(78, 1, 3, 2, 2);
  assert.equal(steps.length, 3 * 2 + 2 * 3);
  assert.deepEqual(steps.slice(0, 3).map((s) => [s.ayah, s.round, s.rounds]), [[1, 1, 2], [1, 2, 2], [2, 1, 2]]);
  assert.deepEqual(steps.slice(6).map((s) => s.ayah), [1, 2, 3, 1, 2, 3]);
  assert.equal(Q.plan(112, 2, 2, 3, 5).length, 3, 'one ayah has no "all together" part');
  assert.throws(() => Q.plan(1, 3, 2, 1, 1));
});

test('juz of an ayah and juz progress', () => {
  assert.equal(Q.juzOf(1, 1), 1);
  assert.equal(Q.juzOf(2, 141), 1);
  assert.equal(Q.juzOf(2, 142), 2);
  assert.equal(Q.juzOf(114, 6), 30);
  const counts = new Array(114).fill(0);
  counts[0] = 7; // only Al-Fatihah counted: juz 1 is all of it
  const p = Q.juzProgress([item({ from: 1, to: 7 })], counts);
  assert.equal(p.length, 30);
  assert.equal(p[0], 1);
  assert.equal(p[29], 0);
});

test('the Qaida path has 12 lessons like the Noorani Qaida', () => {
  assert.equal(Q.LETTERS.length, 29);
  assert.deepEqual(Q.LESSONS.map((l) => l.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(Q.lessonById(1).items.length, 29);
  // Sound lessons leave out alif and hamza: 27 letters, one card per mark.
  assert.equal(Q.lessonById(3).items.length, 27);
  assert.equal(Q.lessonById(6).items.length, 27 * 3);
  assert.equal(Q.lessonById(8).items.length, 27 * 3);
  assert.equal(Q.lessonById(12).kind, 'Surahs');
  assert.equal(Q.lessonById(12).items.length, 0);
  assert.deepEqual(Q.shapes(Q.LETTERS[0]).length, 2, 'alif does not join on the left');
  assert.deepEqual(Q.shapes(Q.LETTERS[1]).length, 4);
});

test('quiz stars and questions', () => {
  assert.deepEqual([0, 1, 2, 4, 5, 9].map(Q.stars), [3, 3, 2, 2, 1, 1]);
  const pool = Q.quizPool(Q.lessonById(1));
  for (let i = 0; i < 50; i++) {
    const q = Q.newQuestion(pool, pool[0]);
    assert.equal(q.options.length, 4);
    assert.ok(q.options.includes(q.answer));
    assert.notEqual(q.answer, pool[0]);
    assert.equal(new Set(q.options.map((o) => o.say)).size, 4);
  }
});

test('recitation links and ayah marks', () => {
  assert.equal(Q.audioUrl('Husary_128kbps', 2, 255), 'https://everyayah.com/data/Husary_128kbps/002255.mp3');
  assert.equal(Q.ayahMark(12), '﴿١٢﴾');
});
