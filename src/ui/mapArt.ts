import type { MapNodeKind } from '../game/model';

// Original ink symbols, shared by route nodes, the detail panel and legend.
export function mapIcon(kind: MapNodeKind): string {
  const paths: Record<MapNodeKind, string> = {
    battle: '<path d="m17 11 7 2 20 29-5 4-22-27zM11 17l10-6M33 37l12 9M33 47l12-10M47 11l-7 2-20 29 5 4 22-27zM53 17l-10-6M31 37l-12 9M31 47l-12-10"/>',
    elite: '<path d="m19 22-8-11 15 6m19 5 8-11-15 6M17 27q0-12 15-12t15 12v10l-8 5-2 9H27l-2-9-8-5z"/><path d="m22 28 8 3-7 5zm20 0-8 3 7 5z" fill="currentColor"/><path d="m29 43 3-5 3 5M30 47v4m4-4v4"/>',
    boss: '<path d="M23 20 11 12 7 4m16 16-9 1-8-7m35 6 12-8 4-8m-16 16 9 1 8-7M20 23l-5 12 9 13 8 9 8-9 9-13-5-12-12-7z"/><path d="m21 31 9 5-7 3zm22 0-9 5 7 3z" fill="currentColor"/><path d="m28 46 4-8 4 8-4 4zM32 17V8m-8 3 8-6 8 6"/>',
    shop: '<path d="m23 12 9 4 9-4-5 13q16 9 15 22-1 9-19 9t-19-9q-1-13 15-22zM25 25h14M26 21h12"/><path d="M38 34q-12-6-12 2 0 4 7 5 10 2 4 7-6 4-13-1m8-17v22"/>',
    campfire: '<path d="M31 7q3 12-5 18 2-10-5-12 3 10-5 20-6 15 6 20-4-8 3-15 1 8 7 12 8-6 6-14 12 11 3 17 16-3 11-18-4-10-11-14 2 10-3 13 2-16-7-27zM13 57l39-5M13 51l38 8"/>',
    event: '<path d="M23 20q1-11 11-10 12 1 10 12-1 6-9 10-5 3-4 10"/><circle cx="31" cy="52" r="2" fill="currentColor"/>',
  };
  return `<svg class="map-glyph" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[kind]}</svg>`;
}

export function mapLandscape(): string {
  const drawing = `<svg class="map-landscape" viewBox="0 0 600 700" preserveAspectRatio="xMidYMin meet" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><g opacity=".38"><path d="m15 180 65-105 51 80 42-60 76 105M36 174l45-73 30 48M80 75l-7 40 13-10 9 21M430 146l48-91 42 61 32-30 39 77M478 55l-5 39 13-10 10 15"/><path d="M25 230q52-18 102 0m-102 7q40-12 90 0M459 190q66-20 120-2m-108 10q48-12 96-2"/><g stroke-width="1.8"><path d="M42 348v90m0-87-24 39h48zm0 22-30 45h60M84 396v76m0-73-21 32h42zm0 17-26 37h52M544 330v92m0-88-25 39h50zm0 21-30 47h60M504 418v64m0-63-18 28h36zm0 15-23 32h46M68 567v66m0-63-19 30h38zm0 18-25 32h50M539 579v74m0-71-21 34h42zm0 19-28 38h56"/></g><path d="M175 558q35-46 16-90t16-91q35-50 16-94m-36 279q30-49 13-92t16-92q32-48 18-94" stroke-dasharray="3 6"/></g><g transform="translate(530 620)" opacity=".65"><circle r="26"/><circle r="19" stroke-dasharray="2 4"/><path d="M0-35V35m-35-35h70M0-24l7 24-7 24-7-24z"/><path d="M-17-17 17 17m0-34-34 34"/><path d="m0-24 7 24H0z" fill="currentColor"/></g></svg>`;
  return drawing + drawing.replace('xMidYMin meet', 'xMidYMax meet');
}
