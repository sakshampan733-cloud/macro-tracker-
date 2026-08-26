/*
 * Capturing a label.
 *
 * Two paths into the same parser, because the platforms differ and only
 * one of them can read an image in the page:
 *
 *   Paste — iOS Live Text and Android Lens both let you select the text in
 *   a photo and copy it. That is a far better OCR engine than anything
 *   this app could ship, it is already on the phone, and it costs two
 *   taps. It is the primary path and it is offered first.
 *
 *   Photo — where the browser exposes TextDetector the image is read here
 *   directly. The photo is kept on screen either way, because the most
 *   reliable correction aid is the label itself sitting next to the
 *   numbers you are checking.
 *
 * Nothing is saved without being shown first. A label is worth capturing
 * precisely because a multivitamin has thirty rows, and thirty rows is
 * also thirty chances for a misread digit — so every field lands in the
 * ordinary builder for correction rather than going straight to the store.
 */

import {
  el, clear, sheet, toast, icon, field, append, replaceKids,
} from '../ui.js';
import { get, commit, saveFood } from '../store.js';
import { haptic } from '../feedback.js';
import { parseLabel, readImage, canReadImages } from '../label.js';
import { openBuilder } from './add.js';
import { NUTRIENTS } from '../data/nutrients.js';

export function openLabelScan(ctx, { name = '', barcode = null } = {}) {
  let parsed = null;
  let photoUrl = null;

  const preview = el('div');
  const result = el('div');

  const paste = el('textarea.label-paste', {
    rows: '5',
    placeholder: 'Paste the label text here',
    oninput: e => run(e.target.value),
  });

  const photo = el('input', {
    type: 'file', accept: 'image/*', capture: 'environment',
    style: { display: 'none' },
    onchange: async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(file);
      replaceKids(preview,
        el('img.label-shot', { src: photoUrl, alt: 'The label you photographed' }),
        el('div.fine', { style: { marginTop: '6px' } },
          canReadImages()
            ? 'Reading it…'
            : 'Your phone can select the text in this photo: press and hold on the '
              + 'image in your gallery, copy, then paste below.'));

      const text = await readImage(file);
      if (text) {
        paste.value = text;
        run(text);
        replaceKids(preview,
          el('img.label-shot', { src: photoUrl, alt: 'The label you photographed' }),
          el('div.fine', { style: { marginTop: '6px' } },
            'Read from the photo. Check every row against the picture before saving.'));
      } else if (canReadImages()) {
        replaceKids(preview,
          el('img.label-shot', { src: photoUrl, alt: 'The label you photographed' }),
          el('div.fine', { style: { marginTop: '6px' } },
            'Could not make out the text. Try a straighter, closer shot, or copy the '
            + 'text from the photo in your gallery and paste it below.'));
      }
    },
  });

  /* ── show what came out ── */
  function run(text) {
    parsed = parseLabel(text);
    clear(result);
    if (!parsed) return;

    const { per100, micros, basis, servingG, missing } = parsed;

    const basisLine = basis === 'per100' ? 'Read as a per 100 g panel.'
      : basis === 'perServing' ? `Read as a per-serving panel and rescaled from ${servingG} g.`
      : 'Could not tell whether this is per 100 g or per serving — check the numbers.';

    const rows = [];
    const show = (k, label, unit) => {
      if (per100[k] == null) return;
      rows.push(el('div.caff-row', {},
        el('span.grow', {}, label),
        el('span.num', {}, `${Math.round(per100[k] * 10) / 10}${unit}`)));
    };
    show('kcal', 'Energy', ' kcal');
    show('p', 'Protein', ' g');
    show('c', 'Carbohydrate', ' g');
    show('sug', 'of which sugars', ' g');
    show('fib', 'Fibre', ' g');
    show('f', 'Fat', ' g');
    show('sat', 'of which saturates', ' g');
    show('na', 'Sodium', ' mg');

    const microRows = Object.entries(micros).map(([k, v]) => {
      const n = NUTRIENTS?.[k];
      return el('div.caff-row', {},
        el('span.grow', {}, n?.label || k),
        el('span.num', {}, `${v} ${n?.unit || ''}`.trim()));
    });

    append(result,
      el('div.fine', { style: { margin: '12px 0 8px' } }, basisLine),

      rows.length ? el('div.tile', {},
        el('div.micro', { style: { marginBottom: '6px' } }, 'Per 100 g'),
        ...rows) : null,

      microRows.length ? el('div.tile', { style: { marginTop: '10px' } },
        el('div.micro', { style: { marginBottom: '6px' } },
          `Vitamins and minerals · ${microRows.length} found`),
        ...microRows) : null,

      missing.length ? el('div.fine.is-warn', { style: { marginTop: '9px' } },
        `Nothing found for ${missing.join(', ')}. You can fill those in on the next screen.`) : null,

      !rows.length && !microRows.length
        ? el('div.fine', {}, 'Nothing recognisable yet. Labels usually paste as one row per line.')
        : null,

      /* ── what to do with it ── */
      rows.length ? el('button.btn.primary.block', { style: { marginTop: '14px' },
        onclick: () => {
          sh.close();
          openBuilder({
            name, barcode,
            food: {
              n: name, barcode,
              per100: {
                kcal: per100.kcal ?? 0, p: per100.p ?? 0, c: per100.c ?? 0, f: per100.f ?? 0,
                fib: per100.fib ?? 0, sug: per100.sug ?? 0, sat: per100.sat ?? 0, na: per100.na ?? 0,
              },
              serv: servingG ? [[`1 serving (${servingG} g)`, servingG]] : [],
              method: 'label', grade: 'B',
            },
            onSaved: () => ctx?.refresh?.(),
          });
        },
      }, 'Check it and save as a food') : null,

      microRows.length ? el('button.btn.block', { style: { marginTop: '9px' },
        onclick: () => openSaveSupplement(micros, name, ctx, () => sh.close()),
      }, 'Save as a supplement') : null);
  }

  const body = el('div', {},
    el('div.fine', {},
      canReadImages()
        ? 'Photograph the panel and it will be read here. If the reading is poor, copy '
          + 'the text from the photo on your phone and paste it instead.'
        : 'Photograph the panel for reference, then use your phone’s own text '
          + 'selection on the picture — press and hold, copy — and paste it below. '
          + 'That reads labels far better than anything running inside a web page.'),

    el('button.btn.block', { style: { marginTop: '12px' }, onclick: () => photo.click() },
      icon('scan', 16), 'Photograph the label'),
    photo,
    preview,

    el('div.section-label', {}, el('span.micro', {}, 'Label text')),
    paste,
    result);

  const sh = sheet({ title: 'Read a label', body });
  return sh;
}

/* ── Saving a supplement off its own label ──────────────────────────── */

function openSaveSupplement(micros, suggestedName, ctx, closeParent) {
  const nameInput = el('input', {
    type: 'text', value: suggestedName || '', placeholder: 'Multivitamin, brand name',
  });
  const doseInput = el('input', { type: 'text', value: '1 tablet', placeholder: '1 tablet' });

  const sh = sheet({
    title: 'Save as a supplement',
    body: el('div', {},
      el('div.fine', {},
        `${Object.keys(micros).length} nutrients read off the label. Once saved, ticking `
        + 'this off counts towards your daily micronutrient totals.'),
      el('div.field', { style: { marginTop: '12px' } },
        el('div.micro', {}, 'Name'), nameInput),
      el('div.field', { style: { marginTop: '12px' } },
        el('div.micro', {}, 'One dose is'), doseInput)),
    foot: el('button.btn.primary.block', {
      onclick: () => {
        const label = nameInput.value.trim();
        if (!label) { toast('Give it a name.', 'err'); return; }
        const id = 'supp:' + Math.random().toString(36).slice(2, 9);
        commit(s => {
          s.supplementsCustom = s.supplementsCustom || {};
          s.supplementsCustom[id] = {
            label, dose: doseInput.value.trim() || '1 dose', tag: 'general',
            provides: { ...micros },
            note: 'Read from the label you captured.',
          };
          s.supplementsTaken = [...(s.supplementsTaken || []), id];
        }, 'supplements');
        haptic('success');
        toast(`${label} added to your supplements.`);
        sh.close();
        closeParent?.();
        ctx?.refresh?.();
      },
    }, 'Save it'),
  });
  return sh;
}
