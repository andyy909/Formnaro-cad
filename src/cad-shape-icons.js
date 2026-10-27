// Small vector illustrations keep the palette immediate, without starting CAD jobs.
export function cadShapeIcon(type,color){
  const paint=/^#[0-9a-f]{6}$/i.test(color)?color:'#87b9ad';
  const path=d=>`<path d="${d}"/>`,ellipse=(cx,cy,rx,ry)=>`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
  const shade=d=>`<path d="${d}" fill="#000" fill-opacity=".15" stroke="none"/>`;
  const line=d=>`<path d="${d}" fill="none"/>`;
  const opening=d=>`<path d="${d}" fill="var(--shape-opening,#f4f7f9)"/>`;
  const cube=path('M8 16 30 5 53 16 53 39 30 50 8 39Z')+shade('M30 27 53 16V39L30 50Z')+line('M8 16 30 27 53 16M30 27V50');
  const ring=path('M6 25a24 15 0 1 0 48 0a24 15 0 1 0-48 0M17 25a13 7 0 1 1 26 0a13 7 0 1 1-26 0');
  const illustrations={
    box:cube,
    cylinder:path('M10 15V39C10 51 50 51 50 39V15')+ellipse(30,15,20,9),
    sphere:ellipse(30,27,21,21)+`<ellipse cx="24" cy="20" rx="8" ry="11" fill="#fff" fill-opacity=".22" stroke="none"/>`,
    cone:path('M9 40 30 5 51 40C49 54 11 54 9 40Z')+line('M9 40C15 29 45 29 51 40'),
    pyramid:path('M30 4 6 38 29 50 54 38Z')+shade('M30 4 29 50 54 38Z')+line('M30 4 29 50'),
    roof:path('M5 25 24 5 55 20 38 41 5 25V39L38 52 55 37V20M38 41V52')+shade('M38 41 55 20V37L38 52Z'),
    wedge:path('M7 39V13L52 34V46L27 52Z')+shade('M7 13 27 40 52 34Z')+line('M7 13 27 40V52'),
    triangle:path('M8 30 28 6 53 32 53 42 8 42Z')+shade('M8 30H53V42H8Z'),
    hexagon:path('M8 18 19 6 42 6 53 18 42 30 19 30 8 18V36L19 48H42L53 36V18M19 30V48M42 30V48'),
    polygon:path('M9 20 18 8 34 4 49 14 52 30 39 40 19 37 9 20V31L19 48 39 51 52 41V30M19 37V48M39 40V51'),
    tube:path('M10 15V39C10 51 50 51 50 39V15')+ellipse(30,15,20,9)+opening('M18 15a12 5 0 1 0 24 0a12 5 0 1 0-24 0'),
    torus:ring+line('M7 28C9 43 51 43 53 28'),
    capsule:path('M7 32C0 22 12 7 23 10L49 23C65 31 47 52 36 46Z')+line('M18 11C33 16 21 38 10 38M43 21C56 27 43 47 35 45'),
    star:path('M30 3 36 19 55 20 41 31 46 48 30 38 14 48 19 31 5 20 24 19Z')+shade('M30 23 46 48 30 38 14 48Z'),
    heart:path('M30 47 10 28C-3 13 19 2 30 17C41 2 63 13 50 28Z'),
    gear:path('M26 3h8l3 8 9-1 6 7-5 8 5 8-6 7-9-1-3 8h-8l-3-8-9 1-6-7 5-8-5-8 6-7 9 1Z')+opening('M23 25a7 7 0 1 0 14 0a7 7 0 1 0-14 0'),
    text:`<text x="30" y="38" text-anchor="middle" font-size="31" font-family="Segoe UI,Arial" font-weight="800" stroke="none">Aa</text>`,
    roundbox:path('M10 16Q5 19 7 25V38Q7 42 13 44L26 50Q30 52 36 49L49 42Q54 39 53 34V19Q53 15 47 13L35 7Q30 4 25 7Z')+line('M8 19 27 29Q30 31 34 29L52 18M30 31V50'),
    halfSphere:path('M7 34C7 0 53 0 53 34C53 48 7 48 7 34Z')+ellipse(30,34,23,10),
    thread:path('M18 10V43C18 51 42 51 42 43V10')+ellipse(30,10,12,6)+line('M18 17C23 24 37 24 42 17M18 24C23 31 37 31 42 24M18 31C23 38 37 38 42 31M18 38C23 45 37 45 42 38'),
    nut:path('M7 19 18 7 42 7 53 19 42 32 18 32 7 19V35L18 48H42L53 35V19M18 32V48M42 32V48')+opening('M20 19a10 6 0 1 0 20 0a10 6 0 1 0-20 0')+line('M21 21Q30 15 39 21M23 23Q30 19 37 23'),
    countersink:path('M9 12 23 27V44C23 50 37 50 37 44V27L51 12')+ellipse(30,12,21,8)+line('M9 12Q30 29 51 12M23 27Q30 31 37 27'),
    shellbox:path('M5 17 27 6 55 19V41L33 52 5 38Z')+opening('M12 19 27 12 47 21 33 29Z')+shade('M12 19 27 12V23L33 29Z')+line('M5 17 33 32 55 19M33 32V52'),
  };
  return `<svg viewBox="0 0 60 54" aria-hidden="true" focusable="false" data-shape-icon="${Object.hasOwn(illustrations,type)?type:'box'}"><g fill="${paint}" stroke="#ffffff99" stroke-width="1.1" stroke-linejoin="round" fill-rule="evenodd">${illustrations[type]||cube}</g></svg>`;
}
