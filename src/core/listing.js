/* Génération d'annonces. Fonctions pures.
   Règle d'honnêteté : le texte est construit UNIQUEMENT à partir de ce que l'utilisateur a saisi.
   Un champ vide n'apparaît nulle part : aucune caractéristique, aucun défaut ni aucune garantie n'est inventé. */

const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
const STOP = new Set(['pour', 'avec', 'sans', 'les', 'des', 'une', 'aux', 'sur', 'dans', 'par', 'est', 'the', 'and']);

/* "Libellé : valeur", une par ligne. Une ligne sans « : » devient une valeur seule. */
export function parseLines(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    return i > 0 ? { label: clean(l.slice(0, i)), value: clean(l.slice(i + 1)) } : { label: '', value: clean(l) };
  }).filter((x) => x.value);
}

export function characteristics(d) {
  const base = [['Marque', d.brand], ['Taille', d.size], ['Couleur', d.color], ['Matière', d.material]]
    .filter(([, v]) => clean(v)).map(([label, v]) => ({ label, value: clean(v) }));
  return [...base, ...parseLines(d.extraLines)];
}
export const characteristicsText = (list) => list.map((c) => (c.label ? `${c.label} : ${c.value}` : c.value)).join('\n');

export function title(d) {
  const head = [clean(d.product), clean(d.brand)].filter(Boolean).join(' ');
  return [head, clean(d.size) && `Taille ${clean(d.size)}`, clean(d.color)].filter(Boolean).join(' - ');
}

/* État réel : l'état choisi + remarques saisies. « Aucun défaut » n'est écrit que si la case est cochée. */
export function conditionText(d) {
  return [d.condition && `État : ${d.condition}`, clean(d.flaws) && `Remarques : ${String(d.flaws).trim()}`,
    !clean(d.flaws) && d.noDefects && 'Aucun défaut constaté.'].filter(Boolean).join('\n');
}

export function description(d) {
  const sentence = [clean(d.product), clean(d.brand)].filter(Boolean).join(' ');
  const details = [clean(d.size) && `taille ${clean(d.size)}`, clean(d.color) && `couleur ${clean(d.color)}`, clean(d.material) && `matière ${clean(d.material)}`].filter(Boolean);
  const intro = sentence ? `${sentence}${details.length ? ', ' + details.join(', ') : ''}.` : '';
  const extra = parseLines(d.extraLines).map((c) => `• ${c.label ? c.label + ' : ' : ''}${c.value}`).join('\n');
  return [intro, conditionText(d), extra, String(d.info ?? '').trim()].filter(Boolean).join('\n\n');
}

export function keywords(d) {
  const words = clean(d.product).split(' ').filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()));
  const extra = String(d.keywords ?? '').split(/[,\n]/).map(clean);
  const seen = new Set(), out = [];
  for (const w of [...words, clean(d.brand), clean(d.color), clean(d.material), clean(d.size), ...extra]) {
    if (w && !seen.has(w.toLowerCase())) { seen.add(w.toLowerCase()); out.push(w); }
  }
  return out.slice(0, 20);
}

/* Textes modifiables à la main : conservés tels quels dans le brouillon, prioritaires sur le texte généré. */
export const EDITABLE = ['title', 'description', 'characteristics', 'condition', 'keywords'];
export const cleanEdits = (e) => Object.fromEntries(EDITABLE.filter((k) => typeof e?.[k] === 'string').map((k) => [k, e[k].slice(0, 5000)]));

export const generate = (d) => ({ title: title(d), description: description(d), characteristics: characteristicsText(characteristics(d)),
  condition: conditionText(d), keywords: keywords(d).join(', ') });

/* Textes finaux d'un brouillon : texte généré, sauf là où l'utilisateur l'a modifié. */
export const texts = (d) => ({ ...generate(d), ...cleanEdits(d.edits) });
export const effectiveTitle = (d) => texts(d).title;
