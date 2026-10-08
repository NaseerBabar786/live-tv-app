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
    for (let i = 0; i < p.length; i += 2) { const q = cellXY(p[i]); Kit.burst(q.x, q.y, COLORS[k], 2, 0.45); }
    held = null; base = null;
    afterChange();
  }
  function afterChange() {
    refresh();
    if (allDone()) {
      won = true; wonT = now(); nextN = puzzleFor(level + 1).N;
      Kit.record('colorlink', level);
      setTimeout(() => { sfx.win(); Kit.confetti(150); }, 300);
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
      B.size = Math.min(H * 0.88, W * 0.6);
      B.x = W * 0.36 - B.size / 2 + W * 0.02; B.y = (H - B.size) / 2;
      const px = B.x + B.size + W * 0.04, pw = W - px - W * 0.035;
      panel = { x: px, w: pw, cx: px + pw / 2 };
      const bw = Math.min(pw, 280), bh = Math.max(46, Math.min(H * 0.08, 66));
      buttons = BUTTONS.map((b, i) => ({ ...b, x: panel.cx - bw / 2, y: H * 0.52 + i * (bh + H * 0.03), w: bw, h: bh }));
    } else {
      B.size = Math.min(W * 0.94, H * 0.6);
      B.x = (W - B.size) / 2; B.y = H * 0.16;
      panel = { x: 0, w: W, cx: W / 2 };
      const bw = Math.min(W * 0.42, 240), bh = Math.max(46, Math.min(H * 0.06, 60)), gap = W * 0.04;
      buttons = BUTTONS.map((b, i) => ({ ...b, x: W / 2 - bw - gap / 2 + i * (bw + gap), y: B.y + B.size + H * 0.04, w: bw, h: bh }));
    }
    B.cs = B.size / P.N;
    boardCache = null;
  }
  Kit.onResize(layout);
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
  let boardCache = null;
  function drawBoardCache() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), pad = B.cs * 0.25;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((B.size + pad * 2) * dpr); cv.height = cv.width;
    const c = cv.getContext('2d');
    c.scale(dpr, dpr); c.translate(pad, pad);
    roundRect(c, -pad * 0.6, -pad * 0.6, B.size + pad * 1.2, B.size + pad * 1.2, B.cs * 0.3);
    c.fillStyle = 'rgba(4,6,18,0.82)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(120,160,255,0.35)'; c.stroke();
    c.strokeStyle = 'rgba(140,170,255,0.16)'; c.lineWidth = 1.5;
    c.beginPath();
    for (let i = 1; i < P.N; i++) {
      c.moveTo(i * B.cs, 0); c.lineTo(i * B.cs, B.size);
      c.moveTo(0, i * B.cs); c.lineTo(B.size, i * B.cs);
    }
    c.stroke();
    boardCache = { cv, pad };
  }
  function strokePath(c, p) {
    c.beginPath();
    p.forEach((i, n) => { const q = cellXY(i); if (n) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); });
  }

  function update(dt) { introT += dt; }

  function draw(c, time) {
    const W = Kit.W, H = Kit.H, t = now(), cs = B.cs, N = P.N;
    Kit.background(c, time, '#151a4a', '#04040f', 'rgba(90,120,255,0.10)');
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineCap = 'round';

    if (!boardCache) drawBoardCache();
    c.drawImage(boardCache.cv, B.x - boardCache.pad, B.y - boardCache.pad, B.size + boardCache.pad * 2, B.size + boardCache.pad * 2);

    // Cells under a pipe take a soft tint of its colour.
    for (let i = 0; i < N * N; i++) {
      const k = owner[i];
      if (k < 0) continue;
      c.fillStyle = rgba(COLORS[k], complete(k) ? 0.2 : 0.11);
      c.fillRect(B.x + (i % N) * cs + 1, B.y + Math.floor(i / N) * cs + 1, cs - 2, cs - 2);
    }
    // Pipes: a wide soft glow, the neon body, and a bright core.
    paths.forEach((p, k) => {
      if (p.length < 2) return;
      const col = COLORS[k], f = flash[k] ? clamp(1 - (t - flash[k]) / 0.8, 0, 1) : 0;
      strokePath(c, p);
      c.strokeStyle = rgba(col, 0.22 + f * 0.3); c.lineWidth = cs * (0.62 + f * 0.25); c.stroke();
      c.strokeStyle = col; c.lineWidth = cs * 0.34; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,' + (0.45 + f * 0.4) + ')'; c.lineWidth = cs * 0.09; c.stroke();
    });
    // Dots
    for (let k = 0; k < P.K; k++) {
      const col = COLORS[k], done = complete(k), f = flash[k] ? clamp(1 - (t - flash[k]) / 0.6, 0, 1) : 0;
      for (const i of P.ends[k]) {
        const q = cellXY(i), r = cs * 0.34 * (1 + Math.sin(f * Math.PI) * 0.25);
        if (done) { c.beginPath(); c.arc(q.x, q.y, r * 1.35, 0, Math.PI * 2); c.fillStyle = rgba(col, 0.25); c.fill(); }
        const g = c.createRadialGradient(q.x - r * 0.35, q.y - r * 0.4, r * 0.1, q.x, q.y, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, shade(col, 0.25)); g.addColorStop(1, shade(col, -0.3));
        c.beginPath(); c.arc(q.x, q.y, r, 0, Math.PI * 2); c.fillStyle = g; c.fill();
      }
    }

    // The cursor: a glowing square; while holding a colour it glows in that colour.
    const showCursor = !won && !Kit.touchFirst();
    if (showCursor && cursor < N * N) {
      const x = B.x + (cursor % N) * cs, y = B.y + Math.floor(cursor / N) * cs;
      const sh = t - nopeT < 0.3 ? Math.sin((t - nopeT) * 60) * cs * 0.08 : 0;
      const col = held !== null ? COLORS[held] : '#ffffff', pulse = 0.5 + 0.5 * Math.sin(time * 6);
      roundRect(c, x + 3 + sh, y + 3, cs - 6, cs - 6, cs * 0.18);
      c.strokeStyle = rgba(col === '#ffffff' ? '#ffe45c' : col, 0.35); c.lineWidth = 10; c.stroke();
      c.strokeStyle = held !== null ? '#ffffff' : '#ffe45c'; c.lineWidth = 3 + pulse * 1.5; c.stroke();
    }

    // Side panel: level, flows, filled
    const px = panel.cx, big = Math.round(Math.min(H * 0.07, 46));
    const topY = wide ? H * 0.12 : H * 0.055;
    c.font = `900 ${big}px system-ui, sans-serif`;
    c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,20,0.8)';
    c.strokeText(`Level ${level}`, px, topY);
    const lg = c.createLinearGradient(0, topY - big / 2, 0, topY + big / 2);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#8fd0ff');
    c.fillStyle = lg; c.fillText(`Level ${level}`, px, topY);
    const small = Math.round(Math.max(20, Math.min(H * 0.036, 28)));
    c.font = `700 ${small}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.6)';
    if (wide) c.fillText(`${N} × ${N}`, px, topY + big * 0.95);
    const fd = flowsDone(), pct = Math.round((filled() / (N * N)) * 100);
    if (wide) {
      const sy = H * 0.27, bw = Math.min(panel.w, 280);
      c.font = `800 ${Math.round(small * 1.1)}px system-ui, sans-serif`;
      c.fillStyle = '#fff'; c.textAlign = 'left';
      c.fillText('Flows', px - bw / 2, sy);
      c.fillText('Filled', px - bw / 2, sy + small * 2.2);
      c.textAlign = 'right';
      c.fillStyle = fd === P.K ? '#7dff9a' : '#ffe45c'; c.fillText(`${fd}/${P.K}`, px + bw / 2, sy);
      c.fillStyle = pct === 100 ? '#7dff9a' : '#ffe45c'; c.fillText(`${pct}%`, px + bw / 2, sy + small * 2.2);
      c.textAlign = 'center';
      // a slim bar under Filled
      const by = sy + small * 3.3;
      roundRect(c, px - bw / 2, by, bw, 10, 5); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
      if (pct > 0) { roundRect(c, px - bw / 2, by, (bw * pct) / 100, 10, 5); const bg = c.createLinearGradient(px - bw / 2, 0, px + bw / 2, 0); bg.addColorStop(0, '#12e2e2'); bg.addColorStop(1, '#ff3fd8'); c.fillStyle = bg; c.fill(); }
    } else {
      c.font = `800 ${small}px system-ui, sans-serif`; c.fillStyle = '#fff';
      c.fillText(`Flows ${fd}/${P.K}   ·   Filled ${pct}%`, W / 2, H * 0.11);
    }

    // Buttons
    buttons.forEach((b, i) => {
      const on = showCursor && cursor === N * N + i;
      roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
      const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, on ? '#ffe45c' : 'rgba(255,255,255,0.16)'); g.addColorStop(1, on ? '#ffb703' : 'rgba(255,255,255,0.06)');
      c.fillStyle = g; c.fill();
      c.lineWidth = on ? 3 : 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.26)'; c.stroke();
      c.font = `800 ${Math.round(Math.min(b.h * 0.42, b.w * 0.13))}px system-ui, sans-serif`;
      c.fillStyle = on ? '#2b1600' : '#fff';
      c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    });

    // How to play
    const hs = Math.round(Math.max(18, Math.min(H * 0.03, 23)));
    c.font = `700 ${hs}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.6)';
    const tips = Kit.touchFirst() ? ['Drag from a dot to its twin', 'Fill every cell!']
      : held !== null ? ['Arrows lay the pipe', 'Go back to pull it back', 'OK lets go']
        : cursor >= N * N ? [wide ? '◀ back to the board' : '▲ back to the board', 'OK press', 'Back exits']
          : ['Arrows move · OK on a dot', 'grabs its colour', wide ? '▶ off the edge: buttons' : '▼ off the edge: buttons', 'Back exits'];
    if (wide) {
      const ty = buttons[buttons.length - 1].y + buttons[buttons.length - 1].h + H * 0.07;
      tips.forEach((s, i) => c.fillText(s, px, ty + i * hs * 1.35));
    } else c.fillText(tips.join(' · '), W / 2, H - hs * 1.2);

    if (introT < 6 && level <= 2 && flowsDone() === 0 && held === null) {
      c.globalAlpha = Math.min(1, introT * 2, (6 - introT) * 2);
      c.font = `800 ${Math.round(Math.max(20, Math.min(H * 0.036, 26)))}px system-ui, sans-serif`;
      c.fillStyle = '#fff59d';
      const y = wide ? B.y - cs * 0.25 - Math.max(16, H * 0.022) : B.y - H * 0.025;
      if (wide) {
        const msg = 'Join the pairs · fill the board!', mw = c.measureText(msg).width;
        if (mw > panel.w) c.font = `800 ${Math.floor(Math.max(20, Math.min(H * 0.036, 26)) * panel.w / mw)}px system-ui, sans-serif`;
        c.fillText(msg, px, H * 0.465);
      } else c.fillText('Join each pair of dots and fill the board!', B.x + B.size / 2, y);
      c.globalAlpha = 1;
    }

    const m = muteBox();
    c.font = `${Math.round(m.h * 0.55)}px system-ui, sans-serif`;
    c.globalAlpha = 0.7; c.fillStyle = '#fff';
    c.fillText(Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2);
    c.globalAlpha = 1;

    if (won && t - wonT > 0.7) {
      const a = clamp((t - wonT - 0.7) / 0.4, 0, 1);
      c.fillStyle = `rgba(2,4,16,${0.6 * a})`; c.fillRect(0, 0, W, H);
      c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
      const pw = Math.min(W * 0.84, 540), ph = Math.min(H * 0.52, 300);
      roundRect(c, -pw / 2, -ph / 2, pw, ph, 28);
      const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
      g.addColorStop(0, '#3a49d8'); g.addColorStop(1, '#1a1460');
      c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = '#12e2e2'; c.stroke();
      c.font = `900 ${Math.round(ph * 0.15)}px system-ui, sans-serif`; c.fillStyle = '#fff';
      c.fillText(hints ? 'Level complete!' : 'Perfect!', 0, -ph * 0.25);
      c.font = `700 ${Math.round(ph * 0.08)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillText(hints ? `${hints} hint${hints > 1 ? 's' : ''} used` : 'Solved with no hints', 0, -ph * 0.02);
      const nx = nextN || N;
      c.fillText(nx > N ? `Next: a bigger ${nx} × ${nx} board!` : `Next: ${nx} × ${nx}`, 0, ph * 0.13);
      c.fillStyle = '#fff59d';
      c.fillText(Kit.touchFirst() ? 'Tap for the next level' : 'Press OK for the next level', 0, ph * 0.32);
      c.restore();
    }
  }

  // ---------- Start ----------
  load(false);
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout();
  Kit.canvas.focus();
  if (level > 1) Kit.record('colorlink', level - 1);
})();
