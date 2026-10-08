// Color Link: join each pair of same-coloured dots with a pipe. Pipes can't cross, and the board is
// only done when every pair is joined and every cell holds a pipe. Boards grow from 5×5 to 9×9.
// Remote: arrows move the cursor; OK on a dot (or a pipe) takes hold of that colour, arrows then lay the
// pipe one cell at a time (going back along it pulls it back), OK lets go. Hint and Restart sit beside
// the board; arrow off the board's right edge to reach them. Touch and mouse: drag from a dot.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp, rgba } = Kit;
  const COLORS = ['#ff2e4d', '#2f7bff', '#1fd65f', '#ffd400', '#ff8a00', '#12e2e2', '#ff3fd8', '#9b5cff',
    '#b8ff2e', '#ff9ec4', '#f4f4f4', '#c8894a'];

  // ---------- Puzzles ----------
  // Made offline: a board is split into random paths that fill it and never run beside themselves, and a
  // solver keeps only boards whose dots have a single solution. Upper case = dot, lower case = pipe;
  // letters are colours. 25 of 5×5, 30 of 6×6, 35 of 7×7, 40 of 8×8, 50 of 9×9, easier first in each size.
  const BANK = [
    'AaaaaBbcCADbCEedBdDedddEe',
    'aaaaAabbbBAbCcCBbDdDEeeeE',
    'AbbbbaBCDbaCcdbaAEdBEeedD',
    'aAbbbaCBDBaccddAEcCdEeDdd',
    'AaBCcDAbbcddEbcEDebCeeebB',
    'ABbbbaaaabCdDaBcdEaACDeeE',
    'AbbbbaBCcBaaAccDdDEcEeeeC',
    'AbBACaBaacaaaDcddddcDCccc',
    'ABCccabbbcaADbcdddbcDBbbC',
    'AbbBCabDccabdCDaBdddaaaaA',
    'aaaBbACaabDcCabdBAabDbbbb',
    'AbBcCabCcBabbbbaaaaaDddDA',
    'aaaaaaBbbAaaCbBDAcccdddDC',
    'aaABCaDbbcadbccadbCBADbbb',
    'aABbbacccbacDCbacdDbAcCBb',
    'AaBbbCaADbcBDdbcbbbbccccC',
    'AaaBbCDaabcdCabcDcabcccAB',
    'aaaaAaBbbbaCccbaADcbDddCB',
    'AbbbbaBACbaaacbDdDcbCcccB',
    'AaaaaBCcCabdddabDBdabbbDA',
    'ABcccabCBcabbbcAdDEcDdEeC',
    'AaaABccccbcdDcbcDBCbcCbbb',
    'aaaBCaDAbcadbbcadBDcAdddC',
    'AaaaAbbbbBbccccbcDdCBcCdD',
    'AbbbCabCbcAbcBcbbcccBDddD',
    'ABCDddabccCdabDdddabbBeEaFfEeFaAffff',
    'ABCccDabbBCdaaEeddFaDEdAfadddaFaaaaa',
    'AaaaaBcccCAbcDbbbbcdBeeEcddeFfcCDeEF',
    'aABcCDabbCddabDddEabeEFeabeFfeABeeee',
    'AaaaaBcccCabCDaaabDdaEBbaaaeeEAFfffF',
    'aaaaaBaCccAbadDccbaDEBCbaAebbbEeeFfF',
    'aaaAbBAccCbDCceEbdEeebbdBbbbFdFffffD',
    'AaaABCdDbbbcdbbeEcdbFECcdbffffDbbbBF',
    'ABCDddabccCdabbEeDaFbBeeaffFAeaaaaaE',
    'aAbbbbaCBDdbaccCdbaDdddbaEeeeBaaaAeE',
    'aaABbCAddDbcCdeEbccdeBbccDeeEccccccc',
    'ABCDEDabcdedabcdEdabcdddaBccccaaaaAC',
    'AaaBbBcCaaaAcddddDcDEfffcEeFCfcccccF',
    'ABbbbbaaaaAbccccBbcdDccCcdeeeECDEFfF',
    'AaaaaabbbbbaBccCBaccdDaacDdEAEccCeee',
    'AabBACDabaacdaBaDcdaaadcdEeEdcdddddC',
    'aaaaABacCbbbacDbEeAcdbBeCcDfFeFfffEe',
    'ABCcDdabbccdaAbBcdeeeecdEfFecDFfEecC',
    'AaaaBbccCaaBCddDaaddeEDadEeddaddddAa',
    'aaaaaAabbbbBabCccCABdddddddeEdDEeeDd',
    'AabbbbCaBaAbcaaaBbcDEeCccdDeEccccccc',
    'AbbBACaBaaacaaacccdDcceEDcceeFCcEeFf',
    'AaaabBCccABDeEcdddeccdfFecDdFCEccccc',
    'AaBbBACaaaaacdddddCDeeedeeeFeDEFffeE',
    'AbbbbBabCccCabBddDaaDdaAEaaaaEeeeeee',
    'AaaaABCccCbbddddbEdFfDbedDfBbeFffEee',
    'AaAbbBbbbbCcBdddDcCDEeecccccEcFfFccc',
    'AabbbbCabdDbcaBdEbcAddebcCdEebDddBbb',
    'AbbbbbabcCDbabCDdbaBaaabaaaEaBEeeeaA',
    'aaaBbBaCaccCacAcDdacccEdaAEeedDddddd',
    'aAbbbCDaBbEbcdaFfebcdAGfebcdggFEBcdgHhcccdgGHCDdd',
    'aaaAbbBaBbbbCcaDdEFfcaAdeGfCFDdEgffffffgGfHhHffff',
    'aaaBbbBACaDdEeccaadFecGHadfecghaDFecGHaaaEccccCaA',
    'ABbbbbbaACDEebcccddeBcffFdeEcfGDdhHcfggHhGCfFgggg',
    'AaBbBcCDaaaccEddDAcFeFgGccfefgCcGfefggggfeffffffE',
    'AaaaaaABbbbbcCDdeEbcFGdEbbcfgddbFcfgGdbfCfDddBfff',
    'ABCcdddabbcdEDaFbCDeEafbBgggaffFgHgaHhGghgaAhhhhG',
    'AaaBbbCdDaAEbcdfFeebcdfGeBbcdFgeEGcdDggggcCcccccc',
    'ABbbbbbaAccccbcccDdcbCEFBDcbeefbbCbeGfFbbbEgggggG',
    'AaBbbBCDaaaAccdEeeEcDdCccccdddFfffdGddddFdgggGddd',
    'AaaaABCdddDbbcDeeebCceeFEbgGeHffbGBehHfbbbeeEfffF',
    'aaabbbCADabEbcddaBebcdAaEebCdFffGbBddDfgHhFfffgGH',
    'ABbCcccaabbbbcDaeeEbCdaEFfbbdaaaffBddDaaffGggGaAF',
    'aABbbCcadddbEcAdBDbecddbbbEcdFCccccdffffFDddddddd',
    'aaaBcccADabCEcddABeecdeeeeccdeFffCFdeGgfffDeEgggG',
    'aaaaaaBaccCDabaCEDdabaAeeeABfFgGeeefGgHhhEffffFhH',
    'ABbbbCcaaaDbbcEFAddbcefffDbceBbfFbceCbbbbcEcccccc',
    'aaaaaaaAbbbBCaBbCcccaddddEeAdFfdDeedDfgGHeFffGHhE',
    'aaaaABCaBbbbbcaaaaaaCDdEFfaaGdeefHAgddeFhhgGDeeEH',
    'aaABCDdaBbbccDaaeeEcCFaEaaaAfaaaGggfGHhhHgFgggggg',
    'ABbbCDdaeEbcCdaEAbdddaaaBdFfFddddGffDGgggffffffff',
    'AaaabbbCDCaBEbcdcaeebcDcaeBbcccAeeefffffFeFEeeeee',
    'AbbbbbBaBcCdddaccEdFdacEedfDaccCDffaGgghHfaaAGHFf',
    'AbBccCDabEcDddAbecCEFbbeeeefbffffffbFbbbBGbbbGggg',
    'aaaBCccaDabEecadAbBecaddddecaffFdecaFDddEcaaACccc',
    'ABbbCcCaADbbbbdddeeEbdeeeFGbdeFffgbdeeeeGbdddDEBb',
    'AaBCccDEAbbBcdeEfffcdgGfCFcdgffcccdGfhhhHdFfHDddd',
    'ABCddDEabcDFeeabccfeBabFCfebabfffebabEeeebAbbbbbb',
    'aaABcccabbbcDCabECcddAbeeeEdBbdddddDddfffFFfffGgG',
    'AbbbbbbabCccCBabDddddabBeeEdaeeeFddaegGfDHAEGFfHh',
    'AaaaBbBcccaddDcACadEecaaaddecFffGdecCHfgdEHhhFGdD',
    'AabbbbbCabddDbcabdEbbcabDebFcabeeBfCabeGgFAaBeEgG',
    'aaaabBCaDdabCcaAdabbBDddaaaaEeeeFfagGHeEfaGHhFffA',
    'aaaAbbbabbbbCbabDddcbabCcDcbabBcccbAEeeeebFfffFEB',
    'ABccccCabcDdddabccccdaBaaacdaaaEacdffFeACdFEeeDdd',
    'aABCccDdaEbbFccdaeEbfGCdaaabfggdhHAbffgdhBbbDFGdhIiiddddhhHiiiiI',
    'AaaaaAbBCccccBbCddddccccDEedddddfFEggggdfGggFfgdfHhhHfgDffffffgG',
    'AaBbbbbbCaaaaADbcccEdddbFfcedBbbGfCedhhhgfFeDHIhgGeeiiihEeeIiHhh',
    'aaaAbbbBacCbbDeEaCbbddEFabbDdfffabgggfhHABgIgfHFgggigfffGIiigggG',
    'aaaaaAbBaCccCDbEadddddBeaDaaaAeeaaaeeeeFgGHeIiffgHheeiFIgggGEiii',
    'aaabbbbBACabddddccabdEFdcAabDefDcCbbeefFbbbGeHEebGggehHebbbBeeee',
    'aAbbbcCDabbEbcDdaBEeBcAaaaaaacCaffffaaaafGgffHhFfIgGffHfFiiiIfff',
    'AbBcCddDaBccDdeEaCcffFeFaGgfeeefaagfefffGagfEfHIgAgfffhigggHhhhI',
    'aaaaaAbBacccCbbDaCEeebddaaaaEBdFGgGaaadfDddddAdfhhHIdddfHIiiFfff',
    'AaaAbbbbCcCbbDdbBbbbEFdbeeeeefdbegGfffdbegHFHddbEghhhdIBGgDdddiI',
    'ABbbccccaaabCBDcCcabbbdcEcaaaaDcecFGHaacecfghhAcecFgGhHcEccccccc',
    'ABCcccDdabbbbccdaaaAbDcdbbbbbdCdBEeeedddfffFeeeefGggghHefffFGHEe',
    'aABCDeeeabbcdeDEabccdeddabCFdeEdabBfddddafffgGhHafIigHhGAfFIgggg',
    'ABbCDdDCaaBcccccEaaaaFffeggGaaAfeghhHeEfeGHeeeffeeeefffIFffffIii',
    'aaaBccccADabCbBcddabbbAcdEaaaaacdeeeeeecdffffFecdfGggCEcDffFGccc',
    'AaBbCcccDaEbFffcdaebbBfCdaeeeefFdagggehHdaGAGehDdaaaEeHddddddddd',
    'AbbbcccCaBDbCeeeaddbbEFeadGgbbfeaddgHbfeaIdghBfeAidghhfeIiDgGHFE',
    'aaaAbBcCaDddbccEaaAdbcEefFddBcccfddGgGHcfdhhhhhcFdhICcccDdHiiiiI',
    'aaaaaaABaCcBbbbbaAcCdDEFggggdeefgHDgdeFfghdGdeEIghdddIiiGhhhhhhH',
    'AabbbbbbCaBDdEebcaaAdDebcFfffeebcGggfebbchHgfeBIcHGgfeeicccCfFEI',
    'aABcccdDabbCEcdFabeeecDfabeCccffabeGggfHabEbBgFhabbbAgHhaaaaaggG',
    'AaBccccDEabcdDcdeAbcdCcdeebCddddBebfFgggbEbfGgHgbbbfffhgIiiiIFHG',
    'aAbbbbbbabbCcccbabdddDCbabDEeeBbabbFfeeGaHbbffegahHBAFegaaaaaEeG',
    'aAbbbbbbabbccccbaBccDdcbaEcfFdCbAecFddbbeeccdbbGeDdCdbGgeEdddbbB',
    'AaAbbBcCBbbbcccDeeeecfFdegGEcfDdegCccffFeggggHhHeeeEggggIiiiiiIG',
    'AbbbbbbBabccccDdabcEeCEdaBcCeeedaffffffdAFGgggfdhhhhHgfDHGggggfF',
    'ABCcccccabBdddDcadddccccAdEccfffDdecffGfeeecFGgfeHhChhHfeEhhhFff',
    'AaBCddddEAbcdFGdeBbcdfgdecccdfgdecHGDFgdechggggdeChhiiIdeeEHIDdd',
    'ABbbccccaADbcEecdddbcFEcdbbbcfFcdBdDcGgcdddccHgCICccIhgGiiiiihhH',
    'ABbbbBCDaaaaAccdEFgggcDdefGEgcccefeegggcefehhhgceFehGHgceeeHgggC',
    'AbbbbbbbabCccccbaBaAdDcbaaaddEcbffFdEeCbfDddgggbfggggHgBFGHhhhgG',
    'aaaaaaaaabbbCcCaAbABaaaabbaaadDEbffFddEebfDddbbbbfffFbGBbbbbbbgG',
    'aaaaaaaAaBCccccCabbbbbBAaaaaaaaaddddEfFGDHEDeFggHheeeGgIIiiiiiii',
    'aaaaaaBbaccCDaabacDddCabacccccAbaaaaEeebfffAgGEbfHffGIBbFhHfFiiI',
    'AbbbbbCDabEfFbcdabeFEbcdaBeeebcdaAggGbcdGggbbbcdHhHbcccdBbbbCDdd',
    'ABcccccCabcdddddabcDeeeDabceeFeEabceGffFabcegHhhabcEggghABcccCGH',
    'aaaaaaaAAbbbbbbbBbcccccbdDcEeeCbdFccCebbdffEeebFDGfBbbbfGgffffff',
    'AabbbccCDAbEbCFfdbbebbGfdbHeEbgfdbhhBbgfdbbhIigfdDBhHigFIiiiiigG',
    'ABbbCDddaaaBccCdeEaaAdddedddddFfedgGhhhfeDgHhGhfeEgggghfHhhhhhhF',
    'AbbbbbbbabcCddDbaBcDdBbbaacceeeEFaECegggfaeeegAgfaGgggagFaaaaaaG',
    'aAbBcccDdAEbFCFcGdeebfffcgDeHbbbCcgGehhHbbbbbeIiiiiiibeEjjjjjIbKJjBbbjJbkkkkKbbbb',
    'ABCccDddEabbFcccdeaAbfFGcDebbbgggccEbHggIiiccbhgjjJiicbhGjKkkicbhJjhHkIcBhhhhKkCc',
    'AaBCccddDEabBEcdFfeAeeecddfeeeGccHdfggggcIhdfgjjjciHdfgjDjCIddfgjdjJddFfGJddddKkK',
    'AbbbccccCaBDBcEeFfaAddcCEGfhhhdiIggFhIhdiJgJjhihdijgGjhiHDijKkjhiiiijjKjhhhhhHjjj',
    'AabBcCDeEFabCcddeGfabbbdEegfaaabddDgfHhAbbBggfIhhhGggJfiJKhhHKjfijkkkkkjFIjjjjjjj',
    'ABCcDdddEabbccccDeaabaaAcceFaBagggcefaaagHGcefffFghCceIiGgghhheJiiiiIJhejjjjjjjHE',
    'aaaaAbbBCaddDbbCccaDbbbEeEFabbgggfffabGgHGFIiabbBhhhHiajjjjjjJiaJAiiiiiiaaaIKkkkK',
    'aAbbbBcccaDBEeeCEcAddddeeecfffGdccccfGFgdcdddfgggdCdHDfhHIdddhhfhIiJjjJhFhhhhhhhh',
    'ABbCcccccaAbbbBdDcEeeFdddccdDEfdGHcHdFffdghChdddddghhhiiiiIggggiJjjjjjJgiiiiiiIGg',
    'ABccccddDabCEecdFfabbbecDCfaAGbecccfgggBeeeefgHhhhhHefgiiiiFfefgiJjIJfEfGiIjjjfff',
    'aaaaBCcccAdDabbbbcddaaEeeBcdaafffeeCdaFfGfHeedaaHgfhIeddahGFhieEDAhhhhIeeeeeeeeee',
    'ABbCcccdDaAbbbbcdEfffffBcDefGgGfFccefHhhhhHcefiiiiJjcefiEeIKJcefiieKkCcefFIeeeeee',
    'AaaaaaBbCddddEaAbcdfFDegGbcdfEeeGHbcdfFhhhhBcdiIhCccccdihhJjjjjdihkkkkKjDIHKJjjjj',
    'aAbBCccccabbddDbBcabDdbbbCcabbbbEeeeaafFGgGFeEafHhhhfeeaffffHfeeaaaAfffeeeeeeeeee',
    'AaBbbCcDdEaAEbFccdeeeebfDcdbbbbbfdCdbFffffdddbbbbgGhhhiiiBgJHJhIKiggjjjhKkIGHhhhh',
    'ABbbbbcccaaaaAbCBcdddEebbbcdFddeGgGcdffDeEcccdHfffCcIidhhJfffFidKHjIiiiiDkKjjjjjJ',
    'ABcCDeeeeabcddeFfeaBcdGeHFeaccdgehheacDdGEIhEaCiiiiihhaAiJkkkKhiiijkHhhhIJjjkkkkK',
    'ABCcdddddabbcdEFfdaaBcDeEfdGaachhhFDggachIhhhJgachiiiHjgachKkiiJgaChhKHiGgaaAhhhI',
    'AaaaaaaBbcCddddaAbcEdBFdGgbCedbfdDgbEedbfffgbHhDbbbFgbIhhhhbbGbiJjJhhbbbiiiiIhhhH',
    'AaAbbbbCcbbbbDEbbcbddddeeBCBdffffeeeddFgGfFHeDEegHhhheiIeGeeeeeiJeeejjJKIjjjjjKkk',
    'AaAbbbbbbccCbdddDbcbbbDeeebcbEeeeFEbcbgGHBfbbcbGHhbFbIcbjjjbbbicBJCjjjJiccccIiiii',
    'AaaaaAbbBCcDddbbeEFccCdbEeBfffDdbbbbgGfffhhhhghhhFhIiHghJhhhJiighjjjjjHiGhhhhhhhI',
    'aaaBbcccCADaEbcFfFddAebccccdGEebbbBcdgGDhhhCcddddhIhJjHhhhhihKjIiiiiihkjHhhhhhhKJ',
    'aaaBcccccaBAbCdddcabbbddEdCaeeeDeedDaeFeeeaaaaefFaaaGaaeeEaHhgAaaaaaIhgGIiiiiihhH',
    'aaaaBbbbCaDdaeeeBcaadaeFeeCGAdaefHeeggdaefhIEAgDaefhiiagaaeFhhiaGaJeeehiaaajjJEHI',
    'ABbBcccccaaaAcDddCeeeecFfddECGecHffdccgechIfDcEGechiffceeechiIfccccchhhfJjjjjjJHF',
    'ABCcddddEabbcdfFdeaaBcdFGdEHaccdDgddhaciiIgGdHAciJjjjdccciiIDJdcKkkkkdddccccCkkkK',
    'aaaabbbbbaCcaBaaabaaCaaaDabEaaFGgdaBeeAffgDaAHeiIfggggheiEfJjjgheIeffFjgHeeeJjjjG',
    'aaAbbbbbCaDbbEeEbcadbfffBbcAdbFBfgGCddbbbfgHGdiiiffghgdiJIfJghgdIjjFjgHgddDjjjggg',
    'AaBCccccDEabbbbbCdeAffffbddeFfGgfbdHeiiIgfBdheIeEgffdheeeJgGfdhjjjjfffdhJFfffDddH',
    'aaaaabBcCaDddabccEaaAdAbCeebbbDbbeeFbGbbbEeHfbgggghhhfbbbbghfffIJjbGhFKkiIJbBhhHK',
    'AaaaaaaABcCDbbbbbbcddbeeeeEcdFbEGgHhcdfbbIgghcdffbiiGhcdJfbBiiHcdjffffiiCDjjjJfFI',
    'aaaABcccCAbbbbCDddBbeeEffFdgGefffHhdgEefiiihdggffiJIhDHgFGijJhhhgggiiiIhhhhhhhhhh',
    'AbbbccccDaBAbceEcdaaabceFcdCcBbcefCdGccccefddgeeeeefdFgEHhhhfdfgggggHfDfIiiIgGfff',
    'aAbbbbbcCabbddDBcEaBDdcccceaccccFffeaCGhhhHfeaGghiiIfeahhhIfffeaHAJFfjJeaaajjjjEe',
    'aaaaaaBbBaCdddaaaaacDCDeEFaAcccEeffafffffffaaFGHhhhhAIggjjjJhiigJjHhhhIGggggggggg',
    'aAbbbbbbCABbccccBcccccDdccccEeeFDfffcGgefffHfccgeeeehfIcgggJehfickKGjEhfICKJjjHhF',
    'aaaaaaaaBaccccccAbaCDdEeccbaaAdFeEcBGggDfffcchHgggIffChJjFgiIffhHjfgggGfJjjffffff',
    'aAbbbCccCabbDbbbbBAbEddddddBbeeefFGdhhhIeFggDhJhieegKkhjhiIEgGKhjhhhhhhhHjjjjjjJH',
    'AaABcccDdbbbbcEccDbcccceecCbCbBfFeeebbbFfGggeHhhhiiIgEggghiJjggGKgHiIjJgKkggggggg',
    'aaaaaBcCDaEeBabcDdaaebabcccFaebAbgGcfaebbbgccFaeEAHgcIaaJaahGciaJjahhcciaaaaHCcIi',
    'aaaaabbbbacccABDdbacEcccBDbaCeeEcbbbaaaaaccFfGggGaacCFhhhhhaiiihjJKhaIAiHJKkHaaaI',
    'aaaaBCDEeaFfabcddeaAfabccdefffabbcDefaaaGBcCefaHIgeeeeFahigeJjjaahigeKkjAHhIGeEKJ',
    'aaabbbbbCaBAbDeEbcAbbbdeCBcdddddecccdFffFeGgGdddHeeiiIeEdheiijJeDdHeiKJKeeeeeIkkk',
    'AaaabbbbBCcCaBddddAaaaddeEdFffFdEeDdGgdddHhhHDgdiiijjjdGdiKijKjdddikIJkjIiiikkkkJ',
    'ABbbbBcccaaaaDdCDceeEaadddceffFaggGcefAaagccceffffgcFfehhHfGcCfeHeEfffffeeeIiiiiI',
    'AbbbCDddDabEBccFffaBeeecccfaaaaEgGcfgggaggHcfgIgaghhcfgigAghccfGiggghcFfIiHhhhccC',
    'ABbccccccaAbcddddcBbbcdEFDcGgccdefFcHGcIdeecchccidDecJhCHiEeecjhhhiIcccjCcccccJjj',
    'AbbbbbbBCabdddCcccabDBddeeeabbbFdeGEaDdFfdeggAHddddeEghhiiiiiiGhIihhhHiIhhhhJjjjJ',
    'AaaaaaaaabBccccccabccbbbbcAbcbbdDBccbCbddeeecbbbdFeGeCddddfEgeEdffffGgHhDFIiiiiIH',
  ];

  // Past the end the big boards come back turned and mirrored, so play never runs out.
  function puzzleFor(lv) {
    let i = lv - 1, sym = 0;
    if (i >= BANK.length) { const j = i - BANK.length; i = 90 + (j % (BANK.length - 90)); sym = 1 + (Math.floor(j / (BANK.length - 90)) % 7); }
    const s = BANK[i], N = Math.round(Math.sqrt(s.length));
    const map = (r, c) => {
      // the eight turns and mirrors of the square
      if (sym & 4) [r, c] = [c, r];
      if (sym & 2) r = N - 1 - r;
      if (sym & 1) c = N - 1 - c;
      return r * N + c;
    };
    const g = new Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) g[map(r, c)] = s[r * N + c];
    // Colours, their dots, and the solution path from one dot to the other.
    const letters = [...new Set(g.map((ch) => ch.toLowerCase()))].sort();
    const K = letters.length;
    const dots = new Int8Array(N * N).fill(-1);
    const ends = letters.map(() => []);
    const colorOf = g.map((ch) => letters.indexOf(ch.toLowerCase()));
    g.forEach((ch, i2) => { if (ch !== ch.toLowerCase()) { dots[i2] = colorOf[i2]; ends[colorOf[i2]].push(i2); } });
    const sol = ends.map(([a, b], k) => {
      const p = [a]; let prev = -1, cur = a;
      while (cur !== b) {
        const nx = nbrs(N, cur).find((x) => x !== prev && colorOf[x] === k);
        prev = cur; cur = nx; p.push(cur);
      }
      return p;
    });
    return { N, K, dots, ends, sol };
  }
  function nbrs(N, i) {
    const r = Math.floor(i / N), c = i % N, a = [];
    if (r > 0) a.push(i - N); if (r < N - 1) a.push(i + N); if (c > 0) a.push(i - 1); if (c < N - 1) a.push(i + 1);
    return a;
  }

  // ---------- State ----------
  let level = Kit.store.get('colorlink.level', 1);
  let P, paths, owner, held = null, base = null, cursor = 0, hints = 0;
  let nextN = 0, won = false, wonT = 0, introT = 0, almostT = -9, nopeT = -9;
  const flash = []; // per colour: when it was last joined (for the glow)

  function load(fresh) {
    P = puzzleFor(level);
    paths = P.ends.map(() => []);
    hints = 0; held = null; base = null; won = false; flash.length = 0;
    const saved = fresh ? null : Kit.store.get('colorlink.game', null);
    if (saved && saved.level === level && saved.paths && saved.paths.length === P.K) { paths = saved.paths; hints = saved.hints || 0; }
    owner = new Int8Array(P.N * P.N);
    cursor = P.ends[0][0];
    refresh();
    if (allDone()) { won = true; wonT = now() - 2; }
    layout();
  }
  function save() { Kit.store.set('colorlink.game', { level, paths, hints }); }
  function refresh() {
    owner.fill(-1);
    paths.forEach((p, k) => { if (p.length > 1) for (const i of p) owner[i] = k; });
  }
  const complete = (k) => { const p = paths[k]; return p.length > 1 && P.dots[p[p.length - 1]] === k && p[p.length - 1] !== p[0]; };
  const flowsDone = () => paths.reduce((n, _, k) => n + (complete(k) ? 1 : 0), 0);
  function filled() { let n = 0; for (let i = 0; i < owner.length; i++) if (owner[i] >= 0) n++; return n; }
  const allDone = () => flowsDone() === P.K && filled() === P.N * P.N;
  const now = () => performance.now() / 1000;

  // ---------- Laying pipes ----------
  function grab(i) {
    if (won) return;
    const d = P.dots[i];
    let k;
    if (d >= 0) { k = d; paths[k] = [i]; }
    else if (owner[i] >= 0) { k = owner[i]; paths[k] = paths[k].slice(0, paths[k].indexOf(i) + 1); }
    else { nope(); return; }
    base = paths.map((p) => p.slice());
    held = k; cursor = i;
    refresh();
    sfx.pick();
  }
  function letGo() {
    if (held === null) return;
    held = null; base = null;
    sfx.move();
    afterChange();
  }
  // Other pipes cut by the one in hand come back whole if it is pulled back off them.
  function reflow() {
    const mine = new Set(paths[held]);
    paths.forEach((_, j) => {
      if (j === held) return;
      const b = base[j], cut = b.findIndex((x) => mine.has(x));
      paths[j] = cut < 0 ? b.slice() : b.slice(0, cut);
    });
    refresh();
  }
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  function step(dir) {
    const p = paths[held], h = p[p.length - 1], N = P.N;
    const r = Math.floor(h / N) + DIRS[dir][0], c = (h % N) + DIRS[dir][1];
    if (r < 0 || c < 0 || r >= N || c >= N) { nope(); return false; }
    const t = r * N + c;
    if (p.length > 1 && t === p[p.length - 2]) {
      p.pop();
      Kit.tone(240 + p.length * 18, { type: 'triangle', dur: 0.05, vol: 0.1, slide: 0.8 });
    } else if (p.includes(t)) {
      p.length = p.indexOf(t) + 1;
      Kit.tone(220, { type: 'triangle', dur: 0.08, vol: 0.1, slide: 0.7 });
    } else if (P.dots[t] >= 0 && P.dots[t] !== held) {
      nope(); return false;
    } else {
      const cutting = owner[t] >= 0 && owner[t] !== held;
      p.push(t);
      if (cutting) Kit.noise({ dur: 0.12, vol: 0.1, freq: 2400, sweep: 0.4 });
      if (P.dots[t] === held) {
        cursor = t; reflow(); join(held); return true;
      }
      Kit.tone(320 + p.length * 22, { type: 'triangle', dur: 0.05, vol: 0.12 });
    }
    cursor = t;
    reflow();
    return true;
  }
  function join(k) {
    // A satisfying click: a snap, a bright ping, and sparks along the new pipe.
    Kit.noise({ dur: 0.035, vol: 0.22, freq: 3200, q: 2 });
    Kit.tone(880, { type: 'square', dur: 0.05, vol: 0.06 });
    Kit.tone(1320, { type: 'sine', dur: 0.22, vol: 0.16, at: 0.04 });
    Kit.tone(1760, { type: 'sine', dur: 0.3, vol: 0.08, at: 0.09 });
    flash[k] = now();
    const p = paths[k];
    for (let i = 0; i < p.length; i += 2) { const q = cellXY(p[i]); sparkle(q.x, q.y, 2, COLORS[k], 0.6); }
    Kit.shake(3, 0.15);
    held = null; base = null;
    afterChange();
  }
  function afterChange() {
    refresh();
    if (allDone()) {
      won = true; wonT = now(); nextN = puzzleFor(level + 1).N;
      Kit.record('colorlink', level);
      setTimeout(() => { sfx.win(); Kit.confetti(150); Kit.shake(6, 0.3); }, 300);
      const ph = Math.min(Kit.H * 0.6, 360);
      for (let i = 0; i < 3 - Math.min(2, hints); i++) setTimeout(() => sparkle(Kit.W / 2 + (i - 1) * ph * 0.27, Kit.H / 2 - ph * 0.1, 16, '#ffe066', 1.2), 1150 + i * 250);
    } else if (flowsDone() === P.K) {
      almostT = now();
      Kit.float('Fill every cell!', B.x + B.size / 2, B.y + B.size / 2, { color: '#ffd400', size: Math.round(B.cs * 0.55), life: 1.6, big: true });
    }
    save();
  }
  function hint() {
    if (won) return;
    if (held !== null) letGo();
    // The first colour that isn't laid exactly as the answer gets its pipe.
    const same = (a, b) => a.length === b.length && (a.every((x, i) => x === b[i]) || a.every((x, i) => x === b[b.length - 1 - i]));
    let k = paths.findIndex((p, j) => !complete(j) && !same(p, P.sol[j]));
    if (k < 0) k = paths.findIndex((p, j) => !same(p, P.sol[j]));
    if (k < 0) return;
    const cells = new Set(P.sol[k]);
    paths.forEach((p, j) => { if (j !== k) { const cut = p.findIndex((x) => cells.has(x)); if (cut >= 0) paths[j] = p.slice(0, cut); } });
    paths[k] = P.sol[k].slice();
    hints++;
    sfx.chime();
    join(k);
  }
  function restart() {
    if (won) return;
    held = null; base = null;
    paths = P.ends.map(() => []);
    refresh(); save();
    Kit.noise({ dur: 0.3, vol: 0.1, freq: 1200, sweep: 0.3 });
  }
  function nope() { nopeT = now(); sfx.nope(); }
  function next() {
    level++; Kit.store.set('colorlink.level', level);
    Kit.store.set('colorlink.game', null);
    load(true); introT = 0; sfx.pick();
  }

  // ---------- Layout ----------
  const B = {}; // board: x, y, size, cs
  let buttons = [], panel = {}, wide = true;
  const BUTTONS = [{ id: 'hint', label: '💡 Hint' }, { id: 'restart', label: '⟳ Restart' }];
  function layout() {
    const W = Kit.W, H = Kit.H;
    if (!W || !P) return;
    wide = W / H > 1.15;
    if (wide) {
      B.size = Math.min(H * 0.82, W * 0.58);
      B.x = W * 0.36 - B.size / 2 + W * 0.02; B.y = (H - B.size) / 2;
      const px = B.x + B.size + W * 0.04, pw = W - px - W * 0.035;
      panel = { x: px, w: pw, cx: px + pw / 2 };
      const bw = Math.min(pw, 280), bh = Math.max(46, Math.min(H * 0.08, 66));
      buttons = BUTTONS.map((b, i) => ({ ...b, x: panel.cx - bw / 2, y: H * 0.52 + i * (bh + H * 0.03), w: bw, h: bh }));
    } else {
      B.size = Math.min(W * 0.88, H * 0.58);
      B.x = (W - B.size) / 2; B.y = H * 0.16;
      panel = { x: 0, w: W, cx: W / 2 };
      const bw = Math.min(W * 0.42, 240), bh = Math.max(46, Math.min(H * 0.06, 60)), gap = W * 0.04;
      buttons = BUTTONS.map((b, i) => ({ ...b, x: W / 2 - bw - gap / 2 + i * (bw + gap), y: B.y + B.size + H * 0.04, w: bw, h: bh }));
    }
    B.cs = B.size / P.N;
    boardCache = null; if (sprites) sprites.clear(); glassCache.clear();
  }
  Kit.onResize(() => { scene = null; layout(); });
  const cellXY = (i) => ({ x: B.x + (i % P.N) * B.cs + B.cs / 2, y: B.y + Math.floor(i / P.N) * B.cs + B.cs / 2 });

  // ---------- Remote ----------
  // The cursor is a board cell (0..N²-1) or a button (N² + index).
  function moveCursor(dir) {
    const N = P.N, M = N * N;
    if (cursor < M) {
      const r = Math.floor(cursor / N) + DIRS[dir][0], c = (cursor % N) + DIRS[dir][1];
      if (r >= 0 && c >= 0 && r < N && c < N) { cursor = r * N + c; sfx.move(); return; }
      if ((wide && dir === 'right') || (!wide && dir === 'down')) {
        // off the edge toward the buttons: the nearest one
        const p = cellXY(cursor);
        let bi = 0, bd = Infinity;
        buttons.forEach((b, i) => { const d = Math.abs(b.y + b.h / 2 - p.y) + Math.abs(b.x + b.w / 2 - p.x) * 0.2; if (d < bd) { bd = d; bi = i; } });
        cursor = M + bi; sfx.move();
      }
      return;
    }
    const bi = cursor - M;
    const back = wide ? 'left' : 'up';
    const prev = wide ? 'up' : 'left', nxt = wide ? 'down' : 'right';
    if (dir === back) {
      const b = buttons[bi], y = b.y + b.h / 2, x = b.x + b.w / 2;
      const r = wide ? clamp(Math.floor((y - B.y) / B.cs), 0, N - 1) : N - 1;
      const c = wide ? N - 1 : clamp(Math.floor((x - B.x) / B.cs), 0, N - 1);
      cursor = r * N + c; sfx.move();
    } else if (dir === prev && bi > 0) { cursor--; sfx.move(); }
    else if (dir === nxt && bi < buttons.length - 1) { cursor++; sfx.move(); }
  }
  function press(id) { if (id === 'hint') hint(); else if (id === 'restart') restart(); }
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (won) { if (k === 'ok' && now() - wonT > 1.0) next(); return; }
    if (k === 'restart') { restart(); return; }
    const M = P.N * P.N;
    if (k === 'ok') {
      if (held !== null) letGo();
      else if (cursor >= M) press(buttons[cursor - M].id);
      else grab(cursor);
      return;
    }
    if (k === 'undo') { if (held !== null && paths[held].length > 1) { const p = paths[held]; const h2 = p[p.length - 2]; const dir = h2 === p[p.length - 1] - 1 ? 'left' : h2 === p[p.length - 1] + 1 ? 'right' : h2 < p[p.length - 1] ? 'up' : 'down'; step(dir); } return; }
    if (held !== null) step(k);
    else moveCursor(k);
  });

  // ---------- Touch and mouse: drag a pipe out from a dot ----------
  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  const hitBox = (b, e) => e.x >= b.x && e.y >= b.y && e.x <= b.x + b.w && e.y <= b.y + b.h;
  function cellAt(e) {
    const c = Math.floor((e.x - B.x) / B.cs), r = Math.floor((e.y - B.y) / B.cs);
    return r >= 0 && c >= 0 && r < P.N && c < P.N ? r * P.N + c : -1;
  }
  let dragging = false;
  Kit.onPointer({
    down(e) {
      if (hitBox(muteBox(), e)) { Kit.toggleMute(); return; }
      if (won) { if (now() - wonT > 1.0) next(); return; }
      const bi = buttons.findIndex((b) => hitBox(b, e));
      if (bi >= 0) { cursor = P.N * P.N + bi; press(buttons[bi].id); return; }
      const i = cellAt(e);
      if (i < 0) return;
      if (held !== null) letGo();
      cursor = i;
      if (P.dots[i] >= 0 || owner[i] >= 0) { grab(i); dragging = true; }
    },
    move(e) {
      if (!dragging || held === null) return;
      const i = cellAt(e);
      if (i < 0) return;
      // Walk the pipe toward the pointer one cell at a time, so quick swipes still lay every cell.
      for (let n = 0; n < 24 && held !== null; n++) {
        const p = paths[held], h = p[p.length - 1];
        if (h === i) break;
        const dr = Math.floor(i / P.N) - Math.floor(h / P.N), dc = (i % P.N) - (h % P.N);
        const dir = Math.abs(dr) > Math.abs(dc) ? (dr > 0 ? 'down' : 'up') : (dc > 0 ? 'right' : 'left');
        if (!step(dir)) break;
      }
    },
    up() {
      if (!dragging) return;
      dragging = false;
      if (held !== null) letGo();
    },
  });

  // ---------- Drawing ----------
  // The tunnel scene, the glass board and the orbs are painted once into offscreen pictures (re-baked on
  // resize); each frame draws those plus the neon pipes, a few moving rings and sparks.
  const F = Kit.FONT, U = Kit.UI;
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function mk(w, h, dpr = DPR()) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * dpr)); cv.height = Math.max(1, Math.ceil(h * dpr));
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    return { cv, c };
  }
  function rrAdd(c, x, y, w, h, r) {
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  // Kit.glass and Kit.title use shadowBlur, which is slow on TV boxes: bake each once, then drawImage.
  const glassCache = new Map();
  function glass(c, x, y, w, h, r, o = {}) {
    if (glassCache.size > 80) glassCache.clear();
    const key = [Math.round(w), Math.round(h), Math.round(r), o.tint, o.edge].join('|');
    let g = glassCache.get(key);
    if (!g) {
      const m = 40, b = mk(w + m * 2, h + m * 2);
      Kit.glass(b.c, m, m, w, h, r, { tint: o.tint, edge: o.edge });
      g = { cv: b.cv, m }; glassCache.set(key, g);
    }
    c.drawImage(g.cv, x - g.m, y - g.m, w + g.m * 2, h + g.m * 2);
    if (o.focus || o.glow) {
      const col = o.glow || '#ffd23f', pulse = 0.6 + 0.4 * Math.sin((o.t || 0) * 5);
      c.save(); c.globalCompositeOperation = 'lighter';
      roundRect(c, x - 3, y - 3, w + 6, h + 6, r + 3);
      c.strokeStyle = rgba(col, 0.25 * pulse); c.lineWidth = 14; c.stroke();
      c.strokeStyle = rgba(col, 0.35 * pulse); c.lineWidth = 7; c.stroke();
      c.restore();
      roundRect(c, x - 2, y - 2, w + 4, h + 4, r + 2); c.strokeStyle = col; c.lineWidth = 3; c.stroke();
    }
  }
  function title(c, text, x, y, size, o = {}) {
    const key = ['T', text, Math.round(size), o.color, o.glow].join('|');
    let g = glassCache.get(key);
    if (!g) {
      c.font = `700 ${size}px ${Kit.FONT}`;
      const w = c.measureText(text).width + size * 2, h = size * 2.4, b = mk(w, h);
      Kit.title(b.c, text, w / 2, h / 2, size, o);
      g = { cv: b.cv, w, h }; glassCache.set(key, g);
    }
    c.drawImage(g.cv, x - g.w / 2, y - g.h / 2, g.w, g.h);
  }

  // Pictures with text are baked; bake them again once the bundled fonts have arrived.
  let fontsReady = false, fontCheckT = 0;
  function checkFonts(time) {
    if (fontsReady || time - fontCheckT < 0.25) return;
    fontCheckT = time;
    let ok = time > 6;
    try { if (!document.fonts) ok = true; else document.fonts.forEach((f) => { if (f.family.replace(/["']/g, '') === 'Fredoka' && f.status === 'loaded') ok = true; }); } catch (e) { ok = true; }
    if (ok) { fontsReady = true; sprites.clear(); glassCache.clear(); }
  }
  let scene = null, boardCache = null, rays = null, glowDot = null;
  const sprites = new Map();

  // Neon cyber tunnel: rings of light running to a bright vanishing point, a grid floor and ceiling.
  function bakeScene(W, H) {
    const { cv, c } = mk(W, H, 1);
    const vx = W / 2, vy = H * 0.46;
    let g = c.createRadialGradient(vx, vy, 0, vx, vy, Math.max(W, H) * 0.8);
    g.addColorStop(0, '#3a1d8a'); g.addColorStop(0.25, '#160b45'); g.addColorStop(1, '#03020c');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // perspective lines from the vanishing point to the screen edges
    c.lineWidth = 1.2;
    const edge = [];
    for (let i = 0; i <= 16; i++) { edge.push([(W * i) / 16, 0], [(W * i) / 16, H]); }
    for (let i = 1; i < 9; i++) { edge.push([0, (H * i) / 9], [W, (H * i) / 9]); }
    for (const [x, y] of edge) {
      const lg = c.createLinearGradient(vx, vy, x, y);
      const col = y > vy ? '0,229,255' : '255,64,220';
      lg.addColorStop(0, `rgba(${col},0)`); lg.addColorStop(1, `rgba(${col},0.35)`);
      c.strokeStyle = lg; c.beginPath(); c.moveTo(vx, vy); c.lineTo(x, y); c.stroke();
    }
    // tunnel rings
    // tunnel frames: thin, fading with depth, joined at the corners by bright edges
    for (let k = 0; k < 18; k++) {
      const s = Math.pow(0.8, k), w = W * 1.1 * s, h = H * 1.1 * s;
      c.strokeStyle = k % 2 ? `rgba(255,64,220,${0.16 * s + 0.03})` : `rgba(0,229,255,${0.2 * s + 0.03})`;
      c.lineWidth = Math.max(0.8, 2 * s);
      c.strokeRect(vx - w / 2, vy - h / 2, w, h);
    }
    c.lineWidth = 2;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
      const lg = c.createLinearGradient(vx, vy, vx + dx * W * 0.55, vy + dy * H * 0.55);
      lg.addColorStop(0, 'rgba(160,240,255,0)'); lg.addColorStop(1, 'rgba(160,240,255,0.45)');
      c.strokeStyle = lg; c.beginPath(); c.moveTo(vx, vy); c.lineTo(vx + dx * W * 0.55, vy + dy * H * 0.55); c.stroke();
    });
    g = c.createRadialGradient(vx, vy, 0, vx, vy, H * 0.25);
    g.addColorStop(0, 'rgba(255,200,255,0.55)'); g.addColorStop(0.3, 'rgba(160,80,255,0.25)'); g.addColorStop(1, 'rgba(80,40,200,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    scene = { cv, vx, vy };
    const R = Math.max(W, H) * 0.6, rr = mk(R * 2, R * 2, 0.5);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, w = 0.06 + (i % 2) * 0.04;
      const rg = rr.c.createRadialGradient(R, R, 0, R, R, R);
      rg.addColorStop(0, i % 2 ? 'rgba(255,90,230,0.6)' : 'rgba(0,230,255,0.6)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      rr.c.fillStyle = rg; rr.c.beginPath(); rr.c.moveTo(R, R); rr.c.arc(R, R, R, a - w, a + w); rr.c.closePath(); rr.c.fill();
    }
    rays = { cv: rr.cv, R };
    const gd = mk(32, 32);
    const dg = gd.c.createRadialGradient(16, 16, 0, 16, 16, 16);
    dg.addColorStop(0, 'rgba(255,255,255,1)'); dg.addColorStop(0.3, 'rgba(255,255,255,0.45)'); dg.addColorStop(1, 'rgba(255,255,255,0)');
    gd.c.fillStyle = dg; gd.c.fillRect(0, 0, 32, 32);
    glowDot = gd.cv;
  }
  const motes = Array.from({ length: 34 }, () => ({ a: Math.random() * Math.PI * 2, p: Math.random(), s: 0.5 + Math.random() }));

  // The board: dark smoked glass in a gunmetal frame with a neon rim, grid lines and studs.
  function bakeBoard() {
    const cs = B.cs, fr = Math.max(10, cs * 0.2), m = fr + cs * 0.6, S = B.size;
    const { cv, c } = mk(S + m * 2, S + m * 2);
    c.translate(m, m);
    c.save(); c.shadowColor = 'rgba(0,229,255,0.55)'; c.shadowBlur = cs * 0.5;
    roundRect(c, -fr, -fr, S + fr * 2, S + fr * 2, fr * 1.6); c.fillStyle = '#10142a'; c.fill(); c.restore();
    c.save(); c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = cs * 0.4; c.shadowOffsetY = cs * 0.15;
    roundRect(c, -fr, -fr, S + fr * 2, S + fr * 2, fr * 1.6); c.fillStyle = '#10142a'; c.fill(); c.restore();
    let g = c.createLinearGradient(0, -fr, 0, S + fr);
    g.addColorStop(0, '#59628a'); g.addColorStop(0.08, '#2a304e'); g.addColorStop(0.92, '#151a30'); g.addColorStop(1, '#3a4266');
    roundRect(c, -fr, -fr, S + fr * 2, S + fr * 2, fr * 1.6); c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(0,229,255,0.9)'; roundRect(c, -fr + 1, -fr + 1, S + fr * 2 - 2, S + fr * 2 - 2, fr * 1.6); c.stroke();
    c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,0.35)'; roundRect(c, -fr + 4, -fr + 4, S + fr * 2 - 8, S + fr * 2 - 8, fr * 1.4); c.stroke();
    g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#0d1030'); g.addColorStop(1, '#05061a');
    roundRect(c, 0, 0, S, S, fr * 0.6); c.fillStyle = g; c.fill();
    c.save(); roundRect(c, 0, 0, S, S, fr * 0.6); c.clip();
    c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = cs * 0.3; c.shadowOffsetY = cs * 0.06;
    c.beginPath(); c.rect(-cs, -cs, S + cs * 2, S + cs * 2); rrAdd(c, 0, 0, S, S, fr * 0.6); c.fillStyle = '#000'; c.fill('evenodd');
    c.shadowColor = 'transparent';
    // cell wells
    for (let r = 0; r < P.N; r++) for (let q = 0; q < P.N; q++) {
      roundRect(c, q * cs + cs * 0.05, r * cs + cs * 0.05, cs * 0.9, cs * 0.9, cs * 0.14);
      c.fillStyle = 'rgba(120,150,255,0.045)'; c.fill();
    }
    c.strokeStyle = 'rgba(0,229,255,0.16)'; c.lineWidth = 1.2; c.beginPath();
    for (let i = 1; i < P.N; i++) { c.moveTo(i * cs, 0); c.lineTo(i * cs, S); c.moveTo(0, i * cs); c.lineTo(S, i * cs); }
    c.stroke();
    c.fillStyle = 'rgba(120,240,255,0.5)';
    for (let i = 1; i < P.N; i++) for (let j = 1; j < P.N; j++) { c.beginPath(); c.arc(i * cs, j * cs, 1.6, 0, Math.PI * 2); c.fill(); }
    g = c.createLinearGradient(0, 0, S * 0.7, S);
    g.addColorStop(0, 'rgba(255,255,255,0.09)'); g.addColorStop(0.42, 'rgba(255,255,255,0.03)'); g.addColorStop(0.43, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    c.restore();
    boardCache = { cv, m, s: S + m * 2 };
  }
  // A glowing orb for each colour.
  function orb(k, r) {
    const key = 'orb' + k + Math.round(r);
    let s = sprites.get(key);
    if (s) return s;
    const col = COLORS[k], m = r * 1.1, { cv, c } = mk((r + m) * 2, (r + m) * 2);
    c.translate(r + m, r + m);
    let g = c.createRadialGradient(0, 0, r * 0.6, 0, 0, r + m);
    g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(-r - m, -r - m, (r + m) * 2, (r + m) * 2);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(0, r * 0.75, r * 0.85, r * 0.3, 0, 0, Math.PI * 2); c.fill();
    g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, shade(col, 0.5)); g.addColorStop(0.7, col); g.addColorStop(1, shade(col, -0.45));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = r * 0.05; c.beginPath(); c.arc(0, 0, r * 0.9, Math.PI * 0.2, Math.PI * 0.8); c.stroke();
    const sp = c.createLinearGradient(0, -r, 0, -r * 0.1);
    sp.addColorStop(0, 'rgba(255,255,255,0.9)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sp; c.beginPath(); c.ellipse(-r * 0.12, -r * 0.5, r * 0.55, r * 0.32, -0.3, 0, Math.PI * 2); c.fill();
    s = { cv, size: (r + m) * 2 };
    sprites.set(key, s);
    return s;
  }
  function starPath(c, x, y, R, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, d = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
    c.closePath();
  }
  const sparks = [];
  function sparkle(x, y, n, color, speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (40 + Math.random() * 180) * speed;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0, max: 0.45 + Math.random() * 0.45, s: 4 + Math.random() * 8, color, rot: Math.random() * 3 });
    }
  }
  function icon(c, id, x, y, s, col) {
    c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * 0.14; c.lineCap = 'round'; c.lineJoin = 'round';
    if (id === 'hint') {
      c.beginPath(); c.arc(0, -s * 0.12, s * 0.32, Math.PI * 0.8, Math.PI * 2.2); c.lineTo(s * 0.12, s * 0.28); c.lineTo(-s * 0.12, s * 0.28); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(-s * 0.12, s * 0.44); c.lineTo(s * 0.12, s * 0.44); c.stroke();
    } else {
      c.beginPath(); c.arc(0, 0, s * 0.36, -Math.PI * 0.35, Math.PI * 1.4); c.stroke();
      const a = -Math.PI * 0.35, ax = Math.cos(a) * s * 0.36, ay = Math.sin(a) * s * 0.36;
      c.beginPath(); c.moveTo(ax + s * 0.2, ay - s * 0.05); c.lineTo(ax - s * 0.06, ay - s * 0.2); c.lineTo(ax - s * 0.02, ay + s * 0.14); c.closePath(); c.fill();
    }
    c.restore();
  }
  function strokePath(c, p) {
    c.beginPath();
    p.forEach((i, n) => { const q = cellXY(i); if (n) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); });
  }
  // A point a fraction [f] of the way along a pipe (for the energy pulse).
  function along(p, f) {
    const pos = f * (p.length - 1), i = Math.floor(pos), k = pos - i;
    const a = cellXY(p[i]), b = cellXY(p[Math.min(p.length - 1, i + 1)]);
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
  }

  function update(dt) {
    introT += dt;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.life += dt;
      if (p.life > p.max) { sparks.splice(i, 1); continue; }
      p.vy += 250 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.rot += dt * 4;
    }
  }

  function draw(c, time) {
    checkFonts(time);
    const W = Kit.W, H = Kit.H, t = now(), cs = B.cs, N = P.N;
    if (!scene) bakeScene(W, H);
    if (!boardCache) bakeBoard();
    c.drawImage(scene.cv, 0, 0, W, H);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineCap = 'round';
    // rings rushing out of the tunnel, and specks of light flying past
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const f = (time * 0.18 + i / 3) % 1, s = Math.pow(f, 2.2) * 1.15, w = W * s, h = H * s;
      c.strokeStyle = i % 2 ? `rgba(255,64,220,${0.16 * f})` : `rgba(0,229,255,${0.2 * f})`; c.lineWidth = 1 + 2 * f;
      c.strokeRect(scene.vx - w / 2, scene.vy - h / 2, w, h);
    }
    for (const m of motes) {
      const f = (m.p + time * 0.12 * m.s) % 1, d = Math.pow(f, 2) * Math.max(W, H) * 0.75;
      const x = scene.vx + Math.cos(m.a) * d, y = scene.vy + Math.sin(m.a) * d * 0.7, s = 2 + f * 14;
      c.globalAlpha = f * 0.8; c.drawImage(glowDot, x - s / 2, y - s / 2, s, s);
    }
    c.restore();

    c.drawImage(boardCache.cv, B.x - boardCache.m, B.y - boardCache.m, boardCache.s, boardCache.s);

    // Cells under a pipe glow softly in its colour.
    for (let i = 0; i < N * N; i++) {
      const k = owner[i];
      if (k < 0) continue;
      c.fillStyle = rgba(COLORS[k], complete(k) ? 0.2 : 0.11);
      roundRect(c, B.x + (i % N) * cs + cs * 0.05, B.y + Math.floor(i / N) * cs + cs * 0.05, cs * 0.9, cs * 0.9, cs * 0.14); c.fill();
    }
    // Pipes: neon glass tubes with bloom.
    c.save(); c.globalCompositeOperation = 'lighter';
    paths.forEach((p, k) => {
      if (p.length < 2) return;
      const col = COLORS[k], f = flash[k] ? clamp(1 - (t - flash[k]) / 0.8, 0, 1) : 0;
      strokePath(c, p);
      c.strokeStyle = rgba(col, 0.14 + f * 0.25); c.lineWidth = cs * (0.85 + f * 0.3); c.stroke();
      c.strokeStyle = rgba(col, 0.22 + f * 0.3); c.lineWidth = cs * 0.55; c.stroke();
    });
    c.restore();
    paths.forEach((p, k) => {
      if (p.length < 2) return;
      const col = COLORS[k], f = flash[k] ? clamp(1 - (t - flash[k]) / 0.8, 0, 1) : 0;
      strokePath(c, p);
      c.strokeStyle = shade(col, -0.4); c.lineWidth = cs * 0.4; c.stroke();
      c.strokeStyle = col; c.lineWidth = cs * 0.31; c.stroke();
      c.strokeStyle = shade(col, 0.5); c.lineWidth = cs * 0.15; c.stroke();
      c.save(); c.translate(-cs * 0.035, -cs * 0.045);
      c.strokeStyle = `rgba(255,255,255,${0.75 + f * 0.25})`; c.lineWidth = cs * 0.05; c.stroke();
      c.restore();
      if (complete(k)) { // an energy pulse runs along a joined pipe
        const q = along(p, (time * 0.6 + k * 0.37) % 1), s = cs * 0.7;
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.8;
        c.drawImage(glowDot, q.x - s / 2, q.y - s / 2, s, s); c.restore();
      }
    });
    // Dots: glowing orbs that breathe.
    for (let k = 0; k < P.K; k++) {
      const done = complete(k), f = flash[k] ? clamp(1 - (t - flash[k]) / 0.6, 0, 1) : 0;
      const o = orb(k, cs * 0.34);
      for (const i of P.ends[k]) {
        const q = cellXY(i), sc = (1 + Math.sin(time * 2.4 + k + i) * 0.035) * (1 + Math.sin(f * Math.PI) * 0.3);
        if (done) {
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 + 0.15 * Math.sin(time * 3 + k);
          c.strokeStyle = COLORS[k]; c.lineWidth = 3; c.beginPath(); c.arc(q.x, q.y, cs * 0.42, 0, Math.PI * 2); c.stroke(); c.restore();
        }
        const d = o.size * sc;
        c.drawImage(o.cv, q.x - d / 2, q.y - d / 2, d, d);
      }
    }

    // The cursor: a glowing frame with corner brackets; in the held colour while drawing.
    const showCursor = !won && !Kit.touchFirst();
    if (showCursor && cursor < N * N) {
      const x = B.x + (cursor % N) * cs, y = B.y + Math.floor(cursor / N) * cs;
      const sh = t - nopeT < 0.3 ? Math.sin((t - nopeT) * 60) * cs * 0.08 : 0;
      const col = held !== null ? COLORS[held] : '#ffe45c', pulse = 0.5 + 0.5 * Math.sin(time * 6);
      c.save(); c.globalCompositeOperation = 'lighter';
      roundRect(c, x + 3 + sh, y + 3, cs - 6, cs - 6, cs * 0.18);
      c.strokeStyle = rgba(col, 0.3 + pulse * 0.2); c.lineWidth = 12; c.stroke();
      c.restore();
      roundRect(c, x + 3 + sh, y + 3, cs - 6, cs - 6, cs * 0.18);
      c.strokeStyle = col; c.lineWidth = 2.5; c.stroke();
      const o = 2 + pulse * 4, L2 = cs * 0.24;
      c.strokeStyle = '#ffffff'; c.lineWidth = 4;
      [[0, 0, 1, 1], [cs, 0, -1, 1], [0, cs, 1, -1], [cs, cs, -1, -1]].forEach(([ox, oy, dx, dy]) => {
        const px = x + ox - dx * o + sh, py = y + oy - dy * o;
        c.beginPath(); c.moveTo(px, py + dy * L2); c.lineTo(px, py); c.lineTo(px + dx * L2, py); c.stroke();
      });
    }

    // Side panel: level, flows, filled
    const px = panel.cx, fd = flowsDone(), pct = Math.round((filled() / (N * N)) * 100);
    const small = Math.round(Math.max(20, Math.min(H * 0.034, 28)));
    if (wide) {
      glass(c, panel.x, H * 0.05, panel.w, H * 0.9, 28, { tint: 'rgba(30,20,90,0.35)', edge: 'rgba(0,229,255,0.45)' });
      const big = Math.round(Math.min(H * 0.075, 52)), topY = H * 0.13;
      title(c, `Level ${level}`, px, topY, big, { color: '#8fe9ff', glow: 'rgba(0,229,255,0.7)' });
      c.font = `600 ${small}px ${U}`; c.fillStyle = 'rgba(200,230,255,0.75)';
      c.fillText(`${N} × ${N}`, px, topY + big * 0.95);
      const sy = H * 0.3, bw = Math.min(panel.w - 40, 280);
      c.font = `600 ${Math.round(small * 1.05)}px ${U}`; c.fillStyle = '#e8f4ff'; c.textAlign = 'left';
      c.fillText('Flows', px - bw / 2, sy);
      c.fillText('Filled', px - bw / 2, sy + small * 2.1);
      c.textAlign = 'right'; c.font = `700 ${Math.round(small * 1.25)}px ${F}`;
      c.fillStyle = fd === P.K ? '#7dff9a' : '#ffe45c'; c.fillText(`${fd}/${P.K}`, px + bw / 2, sy);
      c.fillStyle = pct === 100 ? '#7dff9a' : '#ffe45c'; c.fillText(`${pct}%`, px + bw / 2, sy + small * 2.1);
      c.textAlign = 'center';
      const by = sy + small * 3.3, bh = 14;
      roundRect(c, px - bw / 2, by, bw, bh, bh / 2); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill();
      c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,0.2)'; c.stroke();
      if (pct > 0) {
        const fw = Math.max(bh, (bw * pct) / 100);
        roundRect(c, px - bw / 2, by, fw, bh, bh / 2);
        const bg = c.createLinearGradient(px - bw / 2, 0, px + bw / 2, 0); bg.addColorStop(0, '#12e2e2'); bg.addColorStop(1, '#ff3fd8');
        c.fillStyle = bg; c.fill();
        c.save(); c.clip();
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(px - bw / 2, by + 2, fw, bh * 0.3);
        const sx = px - bw / 2 + ((time * 0.5) % 1.4) * bw - bw * 0.2;
        c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(sx, by, bw * 0.08, bh);
        c.restore();
      }
    } else {
      const big = Math.round(Math.min(H * 0.06, 46));
      title(c, `Level ${level}`, W / 2, H * 0.055, big, { color: '#8fe9ff', glow: 'rgba(0,229,255,0.7)' });
      c.font = `700 ${small}px ${U}`; c.fillStyle = '#fff';
      c.fillText(`Flows ${fd}/${P.K}   ·   Filled ${pct}%`, W / 2, H * 0.11);
    }

    // Buttons: glass pills with drawn icons
    buttons.forEach((b, i) => {
      const on = showCursor && cursor === N * N + i;
      glass(c, b.x, b.y, b.w, b.h, b.h / 2, { tint: on ? 'rgba(0,229,255,0.45)' : 'rgba(40,30,110,0.45)', edge: on ? '#ffffff' : 'rgba(0,229,255,0.5)', focus: on, glow: on ? '#00e5ff' : null, t: time });
      const label = b.id === 'hint' ? 'Hint' : 'Restart', fs = Math.round(Math.min(b.h * 0.42, b.w * 0.13));
      c.font = `700 ${fs}px ${U}`;
      const tw = c.measureText(label).width, x0 = b.x + b.w / 2 - (tw + fs * 1.4) / 2, cy = b.y + b.h / 2;
      icon(c, b.id, x0 + fs * 0.5, cy, fs * 1.05, on ? '#ffffff' : b.id === 'hint' ? '#ffe45c' : '#8fe9ff');
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(label, x0 + fs * 1.4, cy + 1); c.textAlign = 'center';
    });

    // How to play
    const hs = Math.round(Math.max(18, Math.min(H * 0.03, 23)));
    c.font = `500 ${hs}px ${U}`; c.fillStyle = 'rgba(220,235,255,0.8)';
    const tips = Kit.touchFirst() ? ['Drag from a dot to its twin', 'Fill every cell!']
      : held !== null ? ['Arrows lay the pipe', 'Go back to pull it back', 'OK lets go']
        : cursor >= N * N ? [wide ? '◀ back to the board' : '▲ back to the board', 'OK press', 'Back exits']
          : ['Arrows move · OK on a dot', 'grabs its colour', wide ? '▶ off the edge: buttons' : '▼ off the edge: buttons', 'Back exits'];
    if (wide) {
      const ty = buttons[buttons.length - 1].y + buttons[buttons.length - 1].h + H * 0.06;
      tips.forEach((s, i) => c.fillText(s, px, ty + i * hs * 1.35));
    } else c.fillText(tips.join(' · '), W / 2, H - hs * 1.2);

    // sparks
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const p of sparks) {
      const k = 1 - p.life / p.max;
      c.globalAlpha = k; c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      starPath(c, 0, 0, p.s * k + 2, (p.s * k + 2) * 0.38); c.fillStyle = p.color; c.fill();
      c.restore();
    }
    c.restore();

    const m = muteBox();
    c.font = `${Math.round(m.h * 0.55)}px ${U}`;
    c.globalAlpha = 0.8; c.fillStyle = '#fff';
    c.fillText(Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2);
    c.globalAlpha = 1;

    // Level intro banner
    if (introT < 1.8 && !won) {
      const a = introT < 0.35 ? ease.back(introT / 0.35) : introT > 1.4 ? 1 - (introT - 1.4) / 0.4 : 1;
      const bw = Math.min(W * 0.5, 440), bh = Math.min(H * 0.17, 120);
      c.save(); c.globalAlpha = clamp(a, 0, 1); c.translate(B.x + B.size / 2, H * 0.48); c.scale(clamp(a, 0, 1.2), clamp(a, 0, 1.2));
      roundRect(c, -bw / 2, -bh / 2, bw, bh, bh * 0.3); c.fillStyle = 'rgba(12,8,40,0.97)'; c.fill();
      glass(c, -bw / 2, -bh / 2, bw, bh, bh * 0.3, { tint: 'rgba(60,30,140,0.4)', glow: '#ff3fd8', t: time });
      title(c, `Level ${level}`, 0, -bh * 0.12, Math.round(bh * 0.4), { color: '#8fe9ff', glow: 'rgba(0,229,255,0.8)' });
      c.font = `600 ${Math.round(bh * 0.18)}px ${U}`; c.fillStyle = '#ffd6f6';
      c.fillText(`${N} × ${N} · ${P.K} flows`, 0, bh * 0.28);
      c.restore();
    } else if (introT < 7 && level <= 2 && flowsDone() === 0 && held === null && wide) {
      c.globalAlpha = Math.min(1, (introT - 1.8) * 2, (7 - introT) * 2);
      const msg = 'Join the pairs · fill the board!';
      let fs = Math.round(Math.max(20, Math.min(H * 0.034, 26)));
      c.font = `700 ${fs}px ${U}`;
      const mw = c.measureText(msg).width;
      if (mw > panel.w - 20) c.font = `700 ${Math.floor(fs * (panel.w - 20) / mw)}px ${U}`;
      c.fillStyle = '#fff59d'; c.fillText(msg, px, H * 0.465);
      c.globalAlpha = 1;
    }

    if (won && t - wonT > 0.7) drawWin(c, W, H, t, time, N);
  }

  function drawWin(c, W, H, t, time, N) {
    const a = clamp((t - wonT - 0.7) / 0.4, 0, 1);
    c.fillStyle = `rgba(2,2,14,${0.65 * a})`; c.fillRect(0, 0, W, H);
    c.save(); c.translate(W / 2, H / 2);
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.3 * a; c.rotate(time * 0.25);
    const rs = Math.min(W, H) * 0.9; c.drawImage(rays.cv, -rs, -rs, rs * 2, rs * 2); c.restore();
    const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.84, 560), ph = Math.min(H * 0.6, 360);
    const pg = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
    pg.addColorStop(0, '#1c1d6a'); pg.addColorStop(1, '#0a0828');
    roundRect(c, -pw / 2, -ph / 2, pw, ph, 30); c.fillStyle = pg; c.fill();
    glass(c, -pw / 2, -ph / 2, pw, ph, 30, { tint: 'rgba(80,60,200,0.15)', glow: '#00e5ff', t: time });
    // header bar
    const hw = pw * 0.8, hh = Math.min(76, ph * 0.21), hy = -ph / 2;
    const hg = c.createLinearGradient(-hw / 2, 0, hw / 2, 0); hg.addColorStop(0, '#12c8e2'); hg.addColorStop(1, '#d43fd8');
    roundRect(c, -hw / 2, hy - hh / 2, hw, hh, hh / 2); c.fillStyle = hg; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)'; roundRect(c, -hw / 2 + 8, hy - hh / 2 + 5, hw - 16, hh * 0.3, hh * 0.15); c.fill();
    title(c, hints ? 'Level complete!' : 'Perfect!', 0, hy + 2, Math.round(hh * 0.55), { color: '#ffffff' });
    const stars = hints === 0 ? 3 : hints === 1 ? 2 : 1;
    for (let i = 0; i < 3; i++) {
      const st = clamp((t - wonT - 1.1 - i * 0.25) / 0.35, 0, 1), sk = st > 0 ? ease.back(st) : 0;
      const sx = (i - 1) * ph * 0.27, sy = -ph * 0.1 - (i === 1 ? ph * 0.05 : 0), R = ph * (i === 1 ? 0.13 : 0.11);
      c.save(); c.translate(sx, sy); c.scale(Math.max(0.001, sk), Math.max(0.001, sk));
      starPath(c, 0, 0, R, R * 0.48);
      if (i < stars) {
        c.shadowColor = '#ffd23f'; c.shadowBlur = 20;
        const g = c.createLinearGradient(0, -R, 0, R); g.addColorStop(0, '#fff6b0'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#e08a00');
        c.fillStyle = g; c.fill(); c.shadowBlur = 0; c.lineWidth = 3; c.strokeStyle = '#fff3c0'; c.stroke();
      } else { c.fillStyle = 'rgba(255,255,255,0.15)'; c.fill(); }
      c.restore();
    }
    c.font = `600 ${Math.round(ph * 0.065)}px ${U}`; c.fillStyle = 'rgba(220,235,255,0.9)';
    c.fillText(hints ? `${hints} hint${hints > 1 ? 's' : ''} used` : 'Solved with no hints', 0, ph * 0.13);
    const nx = nextN || N;
    c.fillText(nx > N ? `Next: a bigger ${nx} × ${nx} board!` : `Next: ${nx} × ${nx}`, 0, ph * 0.24);
    c.globalAlpha = 0.75 + 0.25 * Math.sin(time * 4);
    c.font = `700 ${Math.round(ph * 0.068)}px ${U}`; c.fillStyle = '#fff59d';
    c.fillText(Kit.touchFirst() ? 'Tap for the next level' : 'Press OK for the next level', 0, ph * 0.38);
    c.restore();
  }

  // ---------- Start ----------
  load(false);
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout();
  Kit.canvas.focus();
  if (level > 1) Kit.record('colorlink', level - 1);
})();
