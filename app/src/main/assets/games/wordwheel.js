// Word Wheel: spell words from the letters on the wheel to fill the little crossword. Every word in the
// grid uses the wheel's letters, each letter at most once; the longest uses them all. Real words that
// are not in the grid are bonus words and earn coins, and coins buy hints.
// Remote: Left/Right go round the wheel, OK adds the lit letter, Down enters the word, Up takes the last
// letter back. Shuffle, Hint and Clear sit under the wheel (Left/Right reach them too; Down with no
// word jumps there). Touch and mouse: tap or swipe the letters, tap the word to enter it.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;

  // ---------- Levels ----------
  // Made offline by a script from a hand-picked list of common, family-friendly words.
  // Each level: WHEEL LETTERS | row.col.(a)cross/(d)own.WORD, ... | bonus words (other real words).
  const LEVELS = [
    'RCAE|2.0.a.RACE,0.3.d.ARE,0.0.d.CARE|ARC,CAR,EAR,ERA,ACRE',
    'ASPN|0.0.a.SPAN,0.0.d.SAP,2.0.a.PANS|NAP,PAN,SPA,SNAP',
    'SEUD|0.1.a.DUES,0.2.d.USE,2.0.a.USED|DUE',
    'TBAE|0.0.a.BEAT,0.3.d.TAB,0.1.d.EAT|ATE,BAT,BET,TEA',
    'NOES|2.1.a.ONES,0.2.d.SON,0.0.a.NOSE|ONE',
    'NTGA|2.0.a.GNAT,0.0.d.NAG,0.3.d.ANT|TAG,TAN',
    'AGRPE|1.0.a.GRAPE,0.4.d.REAP,0.1.d.ERA,3.2.a.RAP|AGE,APE,ARE,EAR,GAP,PEA,PEG,RAG,GEAR,PAGE,PARE,PEAR,RAGE',
    'ROMAJ|0.0.a.MAJOR,0.4.d.RAM,0.2.d.JAR,2.0.a.OAR|ARM,JAM,ROAM',
    'DNRAK|2.0.a.DRANK,0.4.d.ARK,0.1.d.DARN,0.3.a.RAN|AND,DARK,RANK',
    'AESLC|4.0.a.SCALE,1.3.d.SEAL,2.0.a.CASE,0.0.d.LACES|SEA,LACE,SALE',
    'STLIL|3.0.a.STILL,0.1.d.LIST,0.0.a.SLIT,0.3.d.TILL|ITS,LIT,SIT,SILL',
    'AECSU|2.0.a.SAUCE,1.0.d.USE,0.4.d.CUE,0.2.d.CAUSE|SEA,CASE',
    'OOLTS|3.0.a.STOOL,0.1.d.LOST,1.3.d.TOO,1.0.a.SOOT|LOT,LOOT,LOTS,SLOT,SOLO,TOOL',
    'PDNAA|0.0.a.PANDA,0.4.d.AND,0.2.d.NAP,0.0.d.PAN|PAD',
    'NDEES|1.0.a.DENSE,0.4.d.NEED,0.1.d.SEE,3.2.a.END|DEN,DENS,ENDS,SEED,SEEN,SEND',
    'TSIAN|1.0.a.SATIN,0.4.d.ANT,0.2.d.ITS,1.0.d.SAT|SIT,TAN,TIN,ANTS,TANS,TINS,STAIN,SAINT',
    'ESYAR|2.0.a.YEARS,1.3.d.ERA,0.0.d.RAYS,0.0.a.RAY|ARE,EAR,RYE,SAY,SEA,YES,EARS,EASY,YEAR',
    'ETACR|4.0.a.CATER,2.4.d.EAR,0.2.d.REACT,0.1.a.ERA|ACT,ARC,ARE,ART,ATE,CAR,CAT,EAT,RAT,TAR,TEA,ACRE,CARE,CART,RACE,RATE,TEAR,CRATE,TRACE',
    'OFWLN|0.0.a.FLOWN,0.4.d.NOW,2.1.a.FLOW,0.2.d.OWL|LOW,OWN,WON,FOWL,WOLF',
    'EWPST|2.0.a.SWEPT,0.0.d.PEST,1.2.d.SEW,0.4.d.SET|PET,PEW,WET,PETS,STEP,STEW,WEPT,WEST',
    'PAYPL|0.0.a.APPLY,0.1.d.PAY,0.3.d.LAP,2.1.a.YAP|LAY,PAL,PLY,PLAY',
    'RESAP|2.0.a.PEARS,0.1.d.SPEAR,2.4.d.SPA,0.1.a.SPAR|APE,ARE,EAR,ERA,PEA,RAP,SAP,SEA,APES,EARS,PARE,PEAR,PEAS,REAP,SPARE,REAPS',
    'VWAEE|1.0.a.WEAVE,1.4.d.EWE,3.2.a.EVE,0.2.d.WAVE|AWE',
    'LESAE|2.0.a.LEASE,0.0.d.EEL,0.2.d.SEA,0.0.a.ELSE|SEE,EASE,EELS,SALE,SEAL,EASEL',
    'MASTE|2.0.a.TEAMS,0.2.d.SEA,0.0.d.MET,0.2.a.SAT|ATE,EAT,MAT,SET,TEA,EAST,EATS,MAST,MATE,MATS,MEAT,SAME,SEAM,SEAT,STEM,TAME,TEAM,TEAS,STEAM',
    'EEVSN|2.0.a.SEVEN,0.3.d.EVE,0.1.d.SEE,0.1.a.SEEN|EVEN',
    'DILKE|2.0.a.LIKED,1.1.d.LIE,0.3.d.LIED,0.3.a.LED|ELK,KID,LID,IDLE,LIKE,DELI',
    'SRDWO|0.3.d.WORDS,0.1.a.ROWS,3.0.a.WORD,2.1.d.SOW,4.3.a.SOD|ROD,ROW,RODS',
    'AWLSH|2.0.a.SHAWL,0.0.d.WAS,0.0.a.WASH,2.4.d.LAW,4.2.a.SAW|ASH,HAS,LAWS',
    'EARDT|0.2.d.RATED,1.1.a.DATE,4.0.a.RED,2.0.d.TAR,0.4.d.DEAR|ARE,ART,ATE,EAR,EAT,ERA,RAT,TEA,DARE,DART,RATE,READ,TEAR,TRADE,TREAD',
    'ERLOW|2.0.a.LOWER,0.0.d.OWL,0.4.d.WORE,2.2.d.WOE,4.0.a.ORE|LOW,OWE,ROW,LORE,ROLE',
    'LECMA|0.0.d.CAMEL,4.0.a.LACE,1.3.d.CAME,2.2.a.MALE,2.5.d.ELM|CALM,CLAM,MEAL',
    'NOESP|0.3.d.OPENS,2.0.a.POSE,4.0.a.PENS,2.1.d.ONE,0.2.a.NOSE|PEN,SON,ONES,OPEN',
    'LOBGE|2.0.a.GLOBE,2.3.d.BEG,2.1.d.LOB,0.0.d.LOG,0.0.a.LOBE|EGO,GEL,LEG',
    'AMIDE|0.0.a.MEDIA,0.4.d.AIDE,2.2.a.AID,0.0.d.MAD,2.2.d.AIM|DAM,DIM,MID,AMID,DIME,IDEA,MADE',
    'SSTENU|1.0.a.SUNSET,0.1.d.TUNES,1.3.d.SUN,4.0.a.USE,3.3.a.NUT|NET,SET,TEN,NEST,NETS,NUTS,SENT,SETS,STUN,SUNS,TENS,TUNE,USES',
    'ONIWDW|2.0.a.WINDOW,0.3.d.NOD,2.2.d.NOW,0.1.a.ION,4.2.a.WIND|DIN,OWN,WIN,WON,WOW,DOWN',
    'ERIATP|3.0.a.PIRATE,0.4.d.IRATE,1.2.d.PARE,0.3.a.TIE,3.0.d.PIT|AIR,APE,APT,ARE,ART,ATE,EAR,EAT,ERA,PAT,PEA,PET,PIE,RAP,RAT,RIP,TAP,TAR,TEA,TIP,PAIR,PART,PEAR,PEAT,PIER,RATE,REAP,RIPE,TAPE,TEAR,TIER,TIRE,TRAP,TRIP,RITE,RAPT,TARP,PITA',
    'TSNNEI|0.0.a.TENNIS,0.5.d.SET,0.0.d.TIES,0.3.d.NINE,2.3.a.NETS|INN,ITS,NET,SIT,TEN,TIE,TIN,NEST,SENT,SITE,TENS,TINS',
    'RAEMTT|1.0.a.MATTER,0.4.d.TEAM,1.2.d.TART,4.0.a.ART,3.2.a.RAM|ARE,ARM,ATE,EAR,EAT,ERA,MAT,MET,RAT,TAR,TEA,MARE,MART,MATE,MEAT,RATE,TAME,TEAR,TERM,TRAM,TREAT',
    'AELKCT|2.0.a.TACKLE,2.0.d.TEA,2.5.d.ELK,0.3.d.TAKE,4.0.a.ACT|ATE,CAT,EAT,LET,CAKE,LACE,LACK,LAKE,LATE,LEAK,TACK,TALE,TALK,TEAL',
    'SELIDF|0.0.a.FIELDS,0.5.d.SELF,0.3.d.LID,2.0.a.SLID,0.1.d.ISLE|ELF,FED,LED,LIE,FILE,FLED,IDLE,LIDS,LIES,LIFE,SIDE,SLED,LIED,DELI,FIELD,FLIES,SLIDE',
    'LCRAED|1.0.a.CRADLE,0.5.d.LEAD,3.3.a.RED,1.0.d.CLAD,0.2.d.EAR|ARC,ARE,CAR,ERA,LAD,LED,ACRE,CARD,CARE,DALE,DARE,DEAL,DEAR,LACE,LARD,RACE,READ,REAL,EARL,CEDAR,CLEAR,DECAL,CARED,RACED',
    'MRLAOF|1.0.a.FORMAL,0.2.d.FROM,0.4.d.OAR,3.0.a.ARM,1.0.d.FOAM|FAR,FOR,OAF,RAM,FARM,FOAL,FORM,LOAF,ORAL,ROAM,MORAL',
    'SERETT|4.1.a.STREET,0.1.d.TREES,0.3.d.STEER,2.0.a.RESET,1.6.d.REST|SEE,SET,TEE,TEST,TREE,TERSE',
    'IRNACG|2.0.a.RACING,0.5.d.NAG,0.3.a.CAN,1.0.d.GRIN,2.2.d.CAR|AIR,ARC,RAG,RAN,RIG,GAIN,RAIN,RANG,RING,GRAIN',
    'LEYWOL|0.0.a.YELLOW,0.2.d.LOW,2.2.a.WOE,0.4.d.OWE,0.0.d.YEW|OWL,WELL,YELL',
    'EAFHRT|0.0.a.FATHER,0.0.d.FATE,0.4.d.EAT,2.0.a.TEA,2.2.d.ATE,4.1.a.HEART|ARE,ART,EAR,ERA,FAR,HAT,HER,RAT,TAR,THE,FARE,FEAR,FEAT,HARE,HEAR,HEAT,RAFT,RATE,TEAR,EARTH,AFTER',
    'GAETNI|2.0.a.EATING,1.0.d.NEAT,0.5.d.NAG,0.2.d.ANTE,0.2.a.AGENT,2.4.d.NET|AGE,ANT,ATE,EAT,GET,TAG,TAN,TEA,TEN,TIE,TIN,GAIN,GAIT,GATE,GNAT,GIANT',
    'TERNOM|4.1.a.MENTOR,2.6.d.NOR,2.3.a.OMEN,1.3.d.TORN,1.0.a.RENT,0.1.d.NET|MEN,MET,NOT,ONE,ORE,ROT,TEN,TOE,TON,NORM,NOTE,TERM,TONE,TORE,TERN,TENOR,TONER',
    'NUTERR|0.0.a.RETURN,0.0.d.RENT,0.2.d.TERN,2.2.a.RUN,3.0.a.TEN,2.4.d.NUT|NET,URN,TRUE,TUNE,TURN',
    'TAPEER|1.1.a.REPEAT,0.1.d.ERA,0.5.d.RATE,1.3.d.PEAT,3.3.a.ARE,4.0.a.PART|APE,APT,ART,ATE,EAR,EAT,PAT,PEA,PET,RAP,RAT,TAP,TAR,TEA,TEE,PARE,PEAR,PEER,REAP,TAPE,TEAR,TRAP,TREE,EATER,RAPT,TARP',
    'TESCRE|4.0.a.SECRET,1.5.d.REST,0.3.d.STEER,2.1.a.TEE,2.1.d.TREE,0.0.a.CREST|SEE,SET,RESET,TREES,TERSE',
    'TVNEIN|2.0.a.INVENT,2.2.d.VIE,2.5.d.TEN,1.0.d.VINE,0.3.d.TIE,0.1.a.VET|INN,NET,TIN,NINE,VEIN,VENT',
    'LNTIES|0.1.d.LISTEN,2.1.a.SILENT,5.0.a.ENLIST,0.3.d.TILE,0.5.d.SENT,0.0.a.SLIT|ITS,LET,LIE,LIT,NET,SET,SIT,TEN,TIE,TIN,ISLE,LENS,LENT,LEST,LIES,LINE,LIST,NEST,NETS,SITE,TENS,TIES,LINT,LETS,TINS,LINES,TILES,TINSEL,INLETS',
    'EERDCU|0.0.a.REDUCE,0.0.d.RUDE,0.4.d.CUE,2.3.a.RED,2.5.d.DUE,4.1.a.CRUDE|CURE,DEER,REED,CURED',
    'EAFYTS|0.1.a.SAFETY,0.6.d.YEAST,0.1.d.SAFE,4.3.a.SEAT,3.0.a.SET,2.4.d.ATE|EAT,SAT,SAY,SEA,TEA,YES,YET,EAST,EASY,EATS,FAST,FATE,FEAT,STAY,TEAS,FEAST',
    'RSFITU|2.0.a.FRUITS,0.4.d.FIT,2.5.d.SIT,0.1.d.SIR,0.1.a.SURF,2.0.d.FUR|ITS,FIST,FITS,RIFT,RUST,SIFT,STIR,SUIT,FIRST,FRUIT',
    'AADERP|3.0.a.PARADE,2.2.d.ERA,1.5.d.ARE,0.0.d.DRAPE,1.4.a.RAP,0.0.a.DARE|APE,EAR,PAD,PEA,RED,AREA,DEAR,PARE,PEAR,READ,REAP',
    'INOEMC|3.0.a.INCOME,0.5.d.MINE,0.1.d.ICON,1.0.a.ICE,2.3.d.CONE,5.0.a.MICE|ION,MEN,ONE,COIN,COME,NICE,OMEN,ONCE',
    'METMNO|2.1.a.MOMENT,0.4.d.TOE,0.4.a.TEN,0.6.d.NOT,1.2.d.TONE,4.0.a.ONE|MEN,MET,MOM,NET,TON,MEMO,NOTE,OMEN',
    'LTHEWA|4.2.a.WEALTH,2.5.d.TALE,1.2.d.THAW,1.0.a.HAT,2.2.a.HEAT,0.0.d.WHALE|ATE,AWE,EAT,HEW,LAW,LET,TEA,THE,WET,HALT,HEAL,LATE,TEAL,WHAT,WHEAT',
    'RTELAE|3.0.a.RELATE,3.1.d.EAR,5.1.a.REEL,1.4.d.RAT,1.1.a.LEER,0.2.d.REAL|ARE,ART,ATE,EAT,EEL,ERA,LET,TAR,TEA,TEE,LATE,RATE,TALE,TEAL,TEAR,TREE,EARL,ALERT,ALTER,LATER,EATER',
    'TNASIG|4.1.a.GIANTS,0.4.d.STAIN,2.3.a.TAGS,0.0.a.GAINS,2.1.d.SAG,0.6.d.ITS|ANT,GAS,NAG,SAT,SIT,TAG,TAN,TIN,ANTS,GAIN,GAIT,GIST,GNAT,SANG,SIGN,SING,STAG,TANS,TINS,SATIN,SAINT,GIANT,STING,SNAG',
    'EKRTSI|0.3.d.STRIKE,5.0.a.TIRE,2.3.a.RISK,4.3.a.KIT,2.5.d.SITE,0.3.a.STIR|ITS,SET,SIR,SIT,SKI,TIE,KITE,KITS,REST,RISE,TIER,TIES,TREK,RITE,KITES,SKIRT',
    'NCSEHO|1.2.a.CHOSEN,0.4.d.HOSE,0.2.d.ECHO,3.0.a.SHONE,0.0.d.HENS,0.7.d.ONCE|HEN,HOE,ONE,SHE,SON,CONE,NOSE,ONES,SHOE,CHOSE,SCONE',
    'KLIECP|2.0.a.PICKLE,1.2.d.ICE,2.4.d.LIKE,5.3.a.KELP,0.5.d.PIE,2.0.d.PIKE|ELK,LIE,LIP,CLIP,EPIC,LICE,LICK,PECK,PICK,PILE',
    'EANRDE|2.0.a.EARNED,0.2.d.EAR,0.0.a.NEED,2.4.d.ERA,2.0.d.END,4.2.a.NEAR|AND,ARE,DEN,RAN,RED,DARE,DARN,DEAR,DEER,EARN,READ,REED',
    'TVCIAE|2.0.a.ACTIVE,2.3.d.ICE,0.0.d.TEA,0.2.d.VAT,0.5.d.ATE,4.0.a.CAVE|ACT,CAT,EAT,TIE,VET,VIE',
    'EDOLRH|1.1.a.HOLDER,1.1.d.HOLE,0.5.d.HERO,3.4.a.HOE,0.3.d.OLD,4.0.a.HERD|DOE,HER,LED,ODE,ORE,RED,ROD,HELD,HOLD,LORD,LORE,RODE,ROLE',
    'LWOERF|3.0.a.FLOWER,2.2.d.WOLF,5.2.a.FORE,3.0.d.FOE,1.4.d.ORE,1.3.a.FOWL,0.6.d.ELF|FEW,FOR,LOW,OWE,OWL,ROW,WOE,FLEW,FLOW,LORE,ROLE,WORE,LOWER',
    'ERARLB|0.0.a.BARREL,0.2.d.RARE,0.0.d.BAR,3.1.a.REAR,2.4.d.ERA,4.4.a.ARE,1.6.d.BARE|EAR,LAB,ABLE,BALE,BEAR,REAL,EARL',
    'DRGEAB|2.0.a.BADGER,0.4.d.ARE,0.1.d.ERA,0.0.a.BED,2.3.d.GRAB,2.5.d.RAGE,4.2.a.BARGE|AGE,BAD,BAG,BAR,BEG,DAB,EAR,RAG,RED,AGED,BADE,BARE,BEAD,BEAR,BRAG,DARE,DEAR,DRAG,GARB,GEAR,READ,BADGE,BEARD,BREAD,GRADE',
    'STTEUA|4.1.a.STATUE,2.2.d.EAT,0.6.d.TASTE,2.4.d.SET,0.3.a.TEST,2.0.a.ATE,0.0.d.TEAS|SAT,SEA,TEA,USE,EAST,EATS,SEAT,STATE',
    'NETALT|3.0.a.TALENT,3.2.d.LET,3.0.d.TEA,5.2.a.TAN,0.3.d.LANE,0.5.d.LENT,1.2.a.LATE|ANT,ATE,EAT,NET,TEN,LEAN,NEAT,TALE,TEAL,TENT,ANTE',
    'AOHCRN|3.0.a.ANCHOR,0.1.d.HORN,0.5.d.ACORN,1.1.a.OAR,0.3.d.ARCH,3.2.d.CAR,5.0.a.CORN|ARC,CAN,NOR,RAN,RANCH',
    'TBRHIG|0.4.d.BRIGHT,5.2.a.HIT,1.2.d.BIRTH,4.0.a.BIT,3.2.a.RIGHT,0.4.a.BIG,0.6.d.GRIT|RIB,RIG',
    'LBTTEA|1.0.a.TABLET,1.3.d.LET,1.5.d.TABLE,3.0.a.BEAT,3.0.d.BET,0.1.d.BALE,5.2.a.ABLE|ATE,BAT,EAT,LAB,TAB,TEA,BELT,LATE,TALE,TEAL,BATTLE',
    'CDEANL|4.1.a.CANDLE,2.4.d.LAD,0.6.d.DANCE,0.4.a.LED,1.2.d.DECAL,1.0.a.AND,0.0.d.CANE|CAN,DEN,END,CLAD,CLAN,DALE,DEAL,LACE,LAND,LANE,LEAD,LEAN,LEND,CLEAN',
    'SDYTUR|0.2.d.STURDY,0.0.a.RUSTY,5.0.a.DRY,2.0.a.STUD,4.2.a.DUSTY,0.0.d.RUST,0.6.d.STUDY|TRY,DUST,DUTY',
    'TNASOTI|2.0.a.STATION,2.3.d.TAN,4.2.a.INTO,0.1.d.ANTS,0.0.a.OAT,0.6.d.TINT,0.4.a.ANT|ION,ITS,NOT,SAT,SIT,SON,TIN,TON,TOT,IONS,OATS,TANS,TONS,TINS,STAIN,SATIN,SAINT,TOAST',
    'EASNRTG|5.0.a.STRANGE,1.0.d.EARNS,1.6.d.GRATE,2.0.a.ATE,3.4.a.ERA,0.4.d.SAGE,0.1.a.NETS|AGE,ANT,ARE,ART,EAR,EAT,GAS,GET,NAG,NET,RAG,RAN,RAT,SAG,SAT,SEA,SET,TAG,TAN,TAR,TEA,TEN,AGES,ANTS,ARTS,EARN,EARS,EAST,EATS,GATE,GEAR,GNAT,NEAR,NEAT,NEST,RAGE,RAGS,RANG,RATE,RATS,RENT,REST,SANE,SANG,SEAT,SENT,STAG,STAR,TAGS,TANS,TEAR,TEAS,TENS,TERN,ANTE,RATES,STARE,TEARS,NEARS,SNARE,STERN,AGENT,ANGER,GRANT,GREAT,RANGE,STAGE,SNAG',
    'HAENITG|1.0.a.HEATING,0.1.d.NEAT,3.1.a.TEN,1.6.d.GATE,3.3.d.NAG,5.1.a.TAG,0.4.d.HIT|AGE,ANT,ATE,EAT,GET,HAT,HEN,NET,TAN,TEA,THE,TIE,TIN,GAIN,GAIT,GNAT,HANG,HEAT,HINT,THAN,THEN,THIN,ANTE,AGENT,EIGHT,GIANT,HINGE,NIGHT,THING,EATING',
    'PECNAAK|3.0.a.PANCAKE,2.4.d.PANE,5.1.a.CAKE,0.6.d.CANE,1.0.d.NAPE,1.2.d.CAN,0.4.a.PECK|APE,CAP,NAP,PAN,PEA,PEN,CAPE,NECK,PACE,PACK,PEAK',
    'SOGEART|1.0.a.STORAGE,0.4.d.OARS,3.0.a.RATES,1.2.d.OAT,1.6.d.EATS,3.3.d.EGO,5.2.a.TORE|AGE,AGO,ARE,ART,ATE,EAR,EAT,ERA,GAS,GET,GOT,OAR,ORE,RAG,RAT,ROT,SAG,SAT,SEA,SET,TAG,TAR,TEA,TOE,AGES,ARTS,EARS,EAST,GATE,GEAR,GOAT,GOES,OATS,OGRE,ORES,RAGE,RAGS,RATE,RATS,REST,ROSE,ROTS,SAGE,SEAT,SOAR,SORE,SORT,STAG,STAR,TAGS,TEAR,TEAS,TOES,STARE,TEARS,AROSE,GOATS,GRATE,GREAT,ROAST,STAGE,STORE',
    'NGIWRTI|1.1.a.WRITING,1.2.d.RING,0.5.d.TIN,3.0.a.WIN,3.0.d.WIT,4.2.a.GRIN,3.4.d.RIG|WIG,GRIT,TWIG,TWIN,WING',
    'EAPTNTR|3.0.a.PATTERN,1.6.d.PAN,3.1.d.ANT,1.3.a.TARP,3.3.d.TAR,5.3.a.RENT,0.4.d.RATE|APE,APT,ARE,ART,ATE,EAR,EAT,ERA,NAP,NET,PAT,PEA,PEN,PET,RAN,RAP,RAT,TAN,TAP,TEA,TEN,EARN,NAPE,NEAR,NEAT,PANE,PANT,PARE,PART,PEAR,PEAT,REAP,TAPE,TART,TEAR,TENT,TRAP,TERN,ANTE,TREAT,PARENT,RAPT',
    'ITELTGR|2.0.a.GLITTER,0.1.d.GEL,0.1.a.GIRL,0.4.d.LET,2.0.d.GILT,5.0.a.TIRE,2.3.d.TILE|GET,LEG,LIE,LIT,RIG,TIE,GRIT,TIER,TILT,RITE,TIGER,TITLE,LITTER',
    'NNIMOAS|3.0.a.MANSION,0.3.d.AIMS,1.3.a.IONS,1.6.d.SON,3.1.d.AIM,5.1.a.MOAN,3.4.d.INN|ION,MAN,MAIN',
    'ECLIEVH|2.0.a.VEHICLE,0.1.d.HEEL,0.1.a.HIVE,0.3.d.VEIL,2.5.d.LICE,0.6.d.EVE,5.3.a.LIE|EEL,ICE,VIE,LIVE',
    'TIRGYAV|2.0.a.GRAVITY,0.6.d.RAY,0.2.d.GRAVY,2.0.d.GRAY,0.4.a.AIRY,2.5.d.TRAY,5.3.a.IVY,4.5.a.ART|AIR,RAG,RAT,RIG,TAG,TAR,TRY,VAT,GAIT,GRIT',
    'IELNCSE|0.1.a.SILENCE,0.7.d.EELS,0.3.d.LIE,0.1.d.SINCE,3.4.a.LIES,4.0.a.LENS,2.5.d.NICE,5.4.a.SEEN|EEL,ICE,SEE,ELSE,ISLE,LICE,LINE,LINES,SCENE,SLICE',
    'EASRPIT|2.0.a.PARTIES,2.6.d.STRIP,0.2.d.PIRATES,0.4.d.RAISE,4.0.a.EAT,0.0.a.TAP,4.4.a.EARS,6.2.a.SIR|AIR,APE,APT,ARE,ART,ATE,EAR,ERA,ITS,PAT,PEA,PET,PIE,PIT,RAP,RAT,RIP,SAP,SAT,SEA,SET,SIP,SIT,SPA,TAR,TEA,TIE,TIP,AIRS,APES,ARTS,EAST,EATS,PAIR,PARE,PART,PAST,PEAR,PEAS,PEAT,PEST,PETS,PIER,PIES,PITS,RATE,RATS,REAP,REST,RIPE,RISE,SEAT,SITE,SPAR,SPIT,STAR,STEP,STIR,TAPE,TAPS,TEAR,TEAS,TIER,TIES,TIPS,TIRE,TRAP,TRIP,RITE,IRATE,PARTS,STRAP,TRAPS,SPARE,SPEAR,PEARS,REAPS,RATES,STARE,TEARS,TAPES,PASTE,SPATE,ARISE,STAIR,TRIPS,PIRATE,PRAISE,STRIPE,RAPT,TARP,PITA',
    'FOIRUNM|2.0.a.UNIFORM,2.3.d.FORM,0.1.d.FIN,4.1.a.FUR,2.5.d.RUIN,0.6.d.RIM,5.3.a.MINOR,0.1.a.FIRM|FOR,FUN,ION,NOR,OUR,RUN,URN,FOUR,FROM,IRON,NORM,INFORM',
    'EIRLTEP|3.0.a.REPTILE,3.0.d.RITE,2.6.d.REEL,5.0.a.TREE,3.2.d.PEER,1.4.d.TRIP,0.1.d.TIRE,0.1.a.TIP|EEL,LET,LIE,LIP,LIT,PET,PIE,PIT,RIP,TEE,TIE,PEEL,PIER,PILE,RIPE,TIER,TILE,LEER',
    'AILTRCE|0.0.a.ARTICLE,0.3.d.ICE,2.0.a.TILE,0.6.d.ERA,2.0.d.TALE,2.2.d.LACE,5.2.a.EARL,3.4.d.AIR|ACT,ARC,ARE,ART,ATE,CAR,CAT,EAR,EAT,LET,LIE,LIT,RAT,TAR,TEA,TIE,ACRE,CARE,CART,LAIR,LATE,LIAR,LICE,RACE,RAIL,RATE,REAL,RICE,TAIL,TEAL,TEAR,TIER,TIRE,RITE,ALERT,ALTER,LATER,IRATE,CLEAR,CRATE,REACT,TRACE,TRAIL,TRIAL,CATER',
    'UOONCTC|3.0.a.COCONUT,3.2.d.CUT,2.4.d.UNTO,5.2.a.TOO,1.6.d.OUT,0.1.d.ONTO,3.0.d.COT,1.1.a.NOT|NUT,TON,COUNT',
    'FINOTCI|2.0.a.FICTION,2.1.d.INTO,2.4.d.ICON,0.6.d.TIN,5.0.a.COT,4.3.a.ION,0.3.a.FONT,0.3.d.FIT|FIN,NOT,TON,COIN',
    'IECLPNA|2.0.a.PELICAN,2.0.d.PAL,0.4.d.NICE,4.0.a.LAP,0.6.d.PANEL,4.5.a.PLEA,1.6.a.APE,1.2.d.CLIP|CAN,CAP,ICE,LIE,LIP,NAP,PAN,PEA,PEN,PIE,PIN,CANE,CAPE,CLAN,CLAP,EPIC,LACE,LAIN,LANE,LEAN,LEAP,LICE,LINE,NAPE,PACE,PAIL,PAIN,PALE,PANE,PEAL,PILE,PINE,PLAN,PLACE,PLANE,ALIEN,CLEAN,PANIC,PLAIN,PENCIL',
    'OREHSTN|4.2.a.SHORTEN,1.8.d.STONE,2.6.d.NET,1.4.d.THRONE,1.0.a.SHORT,0.2.d.NOTES,6.3.a.TERN,3.0.a.HOE|HEN,HER,HOT,NOR,NOT,ONE,ORE,ROT,SET,SHE,SON,TEN,THE,TOE,TON,HENS,HERO,HERS,HORN,HOSE,HOST,NEST,NETS,NOSE,NOTE,ONES,ORES,RENT,REST,ROSE,ROTS,SENT,SHOE,SHOT,SORE,SORT,TENS,THEN,TOES,TONE,TONS,TORE,TORN,TONES,ONSET,SNORE,TENOR,TONER,STERN,HORSE,NORTH,OTHER,SHONE,SHORE,STORE,THOSE,HONEST',
  ];

  const HINT_COST = 20, BONUS_COINS = 3, LEVEL_COINS = 10;
  const ACCENT = '#ff7b29';

  function parse(s) {
    const [letters, grid, bonus] = s.split('|');
    const words = grid.split(',').map((x) => { const [r, c, d, w] = x.split('.'); return { r: +r, c: +c, d, w }; });
    let gw = 0, gh = 0;
    for (const p of words) {
      gw = Math.max(gw, p.c + (p.d === 'a' ? p.w.length : 1));
      gh = Math.max(gh, p.r + (p.d === 'd' ? p.w.length : 1));
    }
    // Cells by key r * 16 + c; each knows its letter and its words.
    const cells = new Map();
    words.forEach((p, wi) => {
      p.cells = [];
      for (let i = 0; i < p.w.length; i++) {
        const r = p.r + (p.d === 'd' ? i : 0), c = p.c + (p.d === 'a' ? i : 0), k = r * 16 + c;
        if (!cells.has(k)) cells.set(k, { r, c, k, ch: p.w[i], words: [], found: false, hint: false, at: -9 });
        cells.get(k).words.push(wi);
        p.cells.push(k);
      }
    });
    return { letters: letters.split(''), words, gw, gh, cells, bonus: new Set(bonus ? bonus.split(',') : []) };
  }

  // ---------- State ----------
  let level = Kit.store.get('wordwheel.level', 1);
  let coins = Kit.store.get('wordwheel.coins', 60);
  let L, found, bonusFound, order, word = [], focus = 0;
  let won = false, wonT = 0, introT = 0, coinBump = 0, shownCoins = coins;
  let wordFx = null; // { kind: 'bad' | 'again' | 'good' | 'bonus', t }
  let flying = []; // letters flying into the grid or to the coins
  let spin = null; // shuffle animation: { from: [], t }
  const addT = []; // when each letter of the word was added, for its pop

  function load(again) {
    L = parse(LEVELS[(level - 1) % LEVELS.length]);
    found = new Set(); bonusFound = new Set();
    order = L.letters.map((_, i) => i); // order[slot] = letter index; slot 0 is at the top
    const saved = again ? null : Kit.store.get('wordwheel.game', null);
    if (saved && saved.level === level) {
      (saved.found || []).forEach((wi) => found.add(wi));
      (saved.bonus || []).forEach((w) => bonusFound.add(w));
      (saved.hints || []).forEach((k) => { const c = L.cells.get(k); if (c) c.hint = true; });
      if (saved.order && saved.order.length === order.length) order = saved.order;
      for (const wi of found) for (const k of L.words[wi].cells) L.cells.get(k).found = true;
    } else if (level > LEVELS.length) shuffleOrder();
    word = []; focus = 0; won = false; finishing = false; flying = []; wordFx = null; spin = null;
    if (found.size === L.words.length) { won = true; wonT = performance.now() / 1000 - 1; }
    layout();
  }
  function save() {
    const hints = [];
    for (const c of L.cells.values()) if (c.hint) hints.push(c.k);
    Kit.store.set('wordwheel.game', { level, found: [...found], bonus: [...bonusFound], hints, order });
    Kit.store.set('wordwheel.coins', coins);
  }
  function shuffleOrder() {
    const n = order.length;
    for (let tries = 0; tries < 10; tries++) {
      const o = order.slice();
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
      if (o.some((x, i) => x !== order[i]) || n < 2) { order = o; return; }
    }
  }

  // ---------- Layout ----------
  const G = {}; // grid: x, y, cs
  const WH = {}; // wheel: x, y, r, rr (letter ring), lr (letter radius)
  let tilesY = 0, tileS = 0, buttons = [], wide = true;
  const BUTTONS = [
    { id: 'shuffle', label: '⤨ Shuffle' },
    { id: 'hint', label: '💡 Hint' },
    { id: 'clear', label: '✕ Clear' },
  ];
  function layout() {
    const W = Kit.W, H = Kit.H;
    if (!W || !L) return;
    wide = W / H > 1.2;
    let gx, gy, gwid, ghei, bw, bh, by, bcx;
    if (wide) {
      gx = W * 0.035; gy = H * 0.15; gwid = W * 0.5; ghei = H * 0.74;
      const cx = W * 0.775;
      WH.r = Math.min(H * 0.225, W * 0.16); WH.x = cx; WH.y = H * 0.495;
      tilesY = H * 0.175; tileS = Math.min(H * 0.085, (W * 0.4) / 7.6);
      bw = Math.min(W * 0.125, 190); bh = Math.max(44, Math.min(H * 0.075, 64)); by = WH.y + WH.r + H * 0.05; bcx = cx;
    } else {
      gx = W * 0.04; gy = H * 0.17; gwid = W * 0.92; ghei = H * 0.3;
      WH.r = Math.min(W * 0.3, H * 0.15); WH.x = W / 2; WH.y = H * 0.7;
      tilesY = H * 0.52; tileS = Math.min(H * 0.06, W * 0.9 / 7.6);
      bw = Math.min(W * 0.29, 190); bh = Math.max(44, Math.min(H * 0.06, 60)); by = WH.y + WH.r + H * 0.03; bcx = W / 2;
    }
    const cs = Math.min(gwid / L.gw, ghei / L.gh, H * 0.135);
    G.cs = cs; G.x = gx + (gwid - cs * L.gw) / 2; G.y = gy + (ghei - cs * L.gh) / 2;
    const n = L.letters.length;
    WH.rr = WH.r * (n <= 4 ? 0.56 : 0.64);
    WH.lr = Math.min(WH.r * 0.27, WH.rr * Math.sin(Math.PI / n) * 0.84);
    const gap = Math.min(16, W * 0.012), total = BUTTONS.length * bw + (BUTTONS.length - 1) * gap;
    buttons = BUTTONS.map((b, i) => ({ ...b, x: bcx - total / 2 + i * (bw + gap), y: by, w: bw, h: bh }));
    sprites.clear();
  }
  Kit.onResize(layout);
  const slotAngle = (s) => -Math.PI / 2 + (s * Math.PI * 2) / L.letters.length;
  function slotPos(s) { const a = slotAngle(s); return { x: WH.x + Math.cos(a) * WH.rr, y: WH.y + Math.sin(a) * WH.rr }; }
  function letterPos(li) {
    // Where letter li is drawn now (it glides during a shuffle).
    const s = order.indexOf(li);
    if (!spin) return slotPos(s);
    const p = ease.inOut(clamp(spin.t / 0.45, 0, 1));
    const s0 = spin.from.indexOf(li);
    const a0 = slotAngle(s0), a1 = slotAngle(s);
    const lift = Math.sin(p * Math.PI) * 0.35; // letters swing in toward the centre on the way
    const a = lerp(a0, a1, p), r = WH.rr * (1 - lift);
    return { x: WH.x + Math.cos(a) * r, y: WH.y + Math.sin(a) * r };
  }
  function tilePos(i, n) {
    const step = tileS * 1.08;
    return { x: WH.x - ((n - 1) * step) / 2 + i * step, y: tilesY };
  }
  const cellXY = (c) => ({ x: G.x + c.c * G.cs + G.cs / 2, y: G.y + c.r * G.cs + G.cs / 2 });

  // ---------- Playing ----------
  const now = () => performance.now() / 1000;
  const NOTE = (i) => 392 * Math.pow(2, (i * 2) / 12);
  function addLetter(li) {
    if (won || flying.some((f) => f.blockInput)) return;
    if (word.includes(li)) { sfx.nope(); return; }
    if (wordFx && wordFx.kind === 'bad') wordFx = null;
    word.push(li); addT[word.length - 1] = now();
    Kit.tone(NOTE(word.length), { type: 'triangle', dur: 0.12, vol: 0.16 });
    Kit.tone(NOTE(word.length) * 2, { type: 'sine', dur: 0.08, vol: 0.05 });
  }
  function removeLetter() {
    if (!word.length) return false;
    word.pop();
    Kit.tone(NOTE(word.length) * 0.8, { type: 'triangle', dur: 0.08, vol: 0.12, slide: 0.7 });
    return true;
  }
  function clearWord() { if (word.length) { word = []; Kit.noise({ dur: 0.12, vol: 0.07, freq: 1800, sweep: 0.5 }); } }
  function submit() {
    if (won || !word.length) return;
    const w = word.map((li) => L.letters[li]).join('');
    const pos = word.map((_, i) => tilePos(i, word.length));
    const wi = L.words.findIndex((p) => p.w === w);
    if (w.length < 3) {
      wordFx = { kind: 'bad', t: now() }; sfx.nope();
      Kit.float('3 letters or more', WH.x, tilesY + tileS, { color: '#ffd23f', size: 26 });
      return;
    }
    if (wi >= 0 && !found.has(wi)) {
      found.add(wi);
      const p = L.words[wi], t0 = now();
      p.cells.forEach((k, i) => {
        const c = L.cells.get(k), to = cellXY(c);
        flying.push({ ch: w[i], x0: pos[i].x, y0: pos[i].y, x1: to.x, y1: to.y, s0: tileS, s1: G.cs * 0.9, t0: t0 + 0.12 + i * 0.07, dur: 0.42, cell: c, blockInput: false });
      });
      word = []; wordFx = null;
      sfx.clear(Math.max(1, w.length - 2), 0);
      if (found.size === L.words.length) finishSoon(t0 + 0.12 + p.cells.length * 0.07 + 0.5);
      save();
      return;
    }
    if (wi >= 0) {
      wordFx = { kind: 'again', t: now(), w };
      Kit.tone(660, { type: 'sine', dur: 0.1, vol: 0.12 }); Kit.tone(660, { type: 'sine', dur: 0.1, vol: 0.12, at: 0.12 });
      Kit.float('Already found', WH.x, tilesY + tileS, { color: '#ffd23f', size: 26 });
      for (const k of L.words[wi].cells) L.cells.get(k).at = now(); // the word winks in the grid
      setTimeout(() => { if (wordFx && wordFx.kind === 'again') { word = []; wordFx = null; } }, 450);
      return;
    }
    if (L.bonus.has(w)) {
      if (bonusFound.has(w)) {
        wordFx = { kind: 'again', t: now() };
        Kit.float('Bonus word already found', WH.x, tilesY + tileS, { color: '#ffd23f', size: 26 });
        sfx.nope();
        setTimeout(() => { if (wordFx && wordFx.kind === 'again') { word = []; wordFx = null; } }, 450);
        return;
      }
      bonusFound.add(w);
      const cb = coinBox(), t0 = now();
      pos.forEach((p, i) => flying.push({ ch: w[i], x0: p.x, y0: p.y, x1: cb.x + cb.h * 0.5, y1: cb.y + cb.h / 2, s0: tileS, s1: tileS * 0.3, t0: t0 + i * 0.05, dur: 0.5, coin: i === pos.length - 1 }));
      word = []; wordFx = null;
      Kit.float(`Bonus word! +${BONUS_COINS}`, WH.x, tilesY + tileS * 1.1, { color: '#ffd23f', size: 30 });
      Kit.tone(988, { type: 'square', dur: 0.07, vol: 0.06 }); Kit.tone(1319, { type: 'square', dur: 0.18, vol: 0.06, at: 0.07 });
      coins += BONUS_COINS;
      save();
      return;
    }
    wordFx = { kind: 'bad', t: now() };
    sfx.nope();
    setTimeout(() => { if (wordFx && wordFx.kind === 'bad') { word = []; wordFx = null; } }, 500);
  }
  // A word whose every letter already shows (from hints and crossing words) counts as found.
  function autoFind() {
    L.words.forEach((p, wi) => {
      if (found.has(wi) || !p.cells.every((k) => { const c = L.cells.get(k); return c.found || c.hint; })) return;
      found.add(wi);
      for (const k of p.cells) { const c = L.cells.get(k); c.found = true; c.at = now(); }
      Kit.tone(880, { type: 'triangle', dur: 0.2, vol: 0.12 });
    });
    if (found.size === L.words.length) finishSoon(now() + 0.4);
  }
  let finishing = false;
  function finishSoon(at) {
    if (finishing) return;
    finishing = true;
    const wait = Math.max(0, at - now());
    setTimeout(() => {
      finishing = false; won = true; wonT = now();
      coins += LEVEL_COINS; save();
      Kit.record('wordwheel', level);
      sfx.win(); Kit.confetti(140);
    }, wait * 1000);
  }
  function hint() {
    if (won) return;
    const open = L.words.map((p, i) => i).filter((i) => !found.has(i));
    if (!open.length) return;
    if (coins < HINT_COST) {
      sfx.nope();
      Kit.float(`A hint costs ${HINT_COST} coins: find bonus words!`, WH.x, buttons[1].y - 20, { color: '#ffd23f', size: 24, life: 1.8 });
      return;
    }
    // The open word with the most letters already showing gets its next hidden letter.
    let best = -1, bestShown = -1;
    for (const wi of open) {
      const ks = L.words[wi].cells, shown = ks.filter((k) => { const c = L.cells.get(k); return c.found || c.hint; }).length;
      if (shown < ks.length && shown > bestShown) { best = wi; bestShown = shown; }
    }
    if (best < 0) return;
    const k = L.words[best].cells.find((kk) => { const c = L.cells.get(kk); return !c.found && !c.hint; });
    const c = L.cells.get(k);
    c.hint = true; c.at = now();
    coins -= HINT_COST; coinBump = 1;
    const p = cellXY(c);
    Kit.burst(p.x, p.y, '#ffd23f', 12, 0.6);
    sfx.chime();
    autoFind();
    save();
  }
  function shuffle() {
    if (won || spin) return;
    spin = { from: order.slice(), t: 0 };
    shuffleOrder();
    Kit.noise({ dur: 0.35, vol: 0.08, freq: 900, q: 1.5, sweep: 2.5 });
    save();
  }
  function press(id) {
    if (id === 'shuffle') shuffle();
    else if (id === 'hint') hint();
    else if (id === 'clear') { if (word.length) clearWord(); else sfx.nope(); }
  }
  function next() {
    level++; Kit.store.set('wordwheel.level', level);
    Kit.store.set('wordwheel.game', null);
    load(true); introT = 0; sfx.pick();
  }

  // ---------- Remote ----------
  const nLetters = () => L.letters.length;
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (won) { if (k === 'ok' && now() - wonT > 0.9) next(); return; }
    const n = nLetters(), total = n + buttons.length;
    if (k === 'left' || k === 'right') {
      focus = (focus + (k === 'right' ? 1 : -1) + total) % total;
      sfx.move();
    } else if (k === 'ok') {
      if (focus < n) addLetter(order[focus]); else press(buttons[focus - n].id);
    } else if (k === 'down') {
      if (word.length) submit();
      else if (focus < n) { focus = n; sfx.move(); }
    } else if (k === 'up' || k === 'undo') {
      if (!removeLetter() && focus >= n && k === 'up') { focus = 0; sfx.move(); }
    } else if (k === 'restart') clearWord();
  });

  // ---------- Touch and mouse: tap or swipe the letters; tap the word to enter it ----------
  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  const coinBox = () => { const h = Math.max(40, Math.min(Kit.H * 0.065, 52)); return { x: Kit.W - 70 - h * 3.6, y: 12, w: h * 3.4, h }; };
  const hitBox = (b, e) => e.x >= b.x && e.y >= b.y && e.x <= b.x + b.w && e.y <= b.y + b.h;
  function letterAt(e) {
    for (let li = 0; li < L.letters.length; li++) {
      const p = letterPos(li);
      if (Math.hypot(e.x - p.x, e.y - p.y) < WH.lr * 1.15) return li;
    }
    return -1;
  }
  let drag = null;
  Kit.onPointer({
    down(e) {
      if (hitBox(muteBox(), e)) { Kit.toggleMute(); return; }
      if (won) { if (now() - wonT > 0.9) next(); return; }
      const bi = buttons.findIndex((b) => hitBox(b, e));
      if (bi >= 0) { focus = nLetters() + bi; press(buttons[bi].id); return; }
      const li = letterAt(e);
      if (li >= 0) {
        focus = order.indexOf(li);
        if (word.includes(li)) { if (word[word.length - 1] === li) removeLetter(); else sfx.nope(); return; }
        addLetter(li);
        drag = { added: 1 };
        return;
      }
      if (word.length && Math.abs(e.y - tilesY) < tileS && Math.abs(e.x - WH.x) < (word.length + 1) * tileS * 0.6) submit();
    },
    move(e) {
      if (!drag) return;
      const li = letterAt(e);
      if (li < 0) return;
      if (!word.includes(li)) { addLetter(li); drag.added++; focus = order.indexOf(li); }
      else if (word.length >= 2 && word[word.length - 2] === li) { removeLetter(); drag.added--; focus = order.indexOf(li); }
    },
    up(e, cancel) {
      if (!drag) return;
      const d = drag; drag = null;
      if (!cancel && d.added >= 2) submit();
    },
  });

  // ---------- Drawing ----------
  // Grid tiles are drawn once per size and kind; gradients every frame are slow on TV boxes.
  const sprites = new Map();
  function tileSprite(kind, size) {
    const key = kind + Math.round(size);
    let s = sprites.get(key);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    s = document.createElement('canvas');
    s.width = s.height = Math.ceil(size * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    const p = size * 0.05, r = size * 0.18;
    roundRect(c, p, p, size - 2 * p, size - 2 * p, r);
    if (kind === 'empty') {
      c.fillStyle = 'rgba(255,255,255,0.13)'; c.fill();
      c.lineWidth = Math.max(1.5, size * 0.03); c.strokeStyle = 'rgba(255,255,255,0.28)'; c.stroke();
    } else {
      const g = c.createLinearGradient(0, 0, 0, size);
      if (kind === 'found') { g.addColorStop(0, '#ffc06b'); g.addColorStop(0.5, ACCENT); g.addColorStop(1, '#d9480f'); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e6dcf5'); }
      c.fillStyle = g; c.fill();
      c.lineWidth = size * 0.045; c.strokeStyle = kind === 'found' ? '#a8370a' : '#b9a7d6'; c.stroke();
      roundRect(c, p + size * 0.1, p + size * 0.07, size - 2 * p - size * 0.2, size * 0.26, r * 0.6);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
    }
    sprites.set(key, s);
    return s;
  }
  function drawTile(c, kind, x, y, size, ch, scale = 1) {
    const s = tileSprite(kind, size), d = size * scale;
    c.drawImage(s, x - d / 2, y - d / 2, d, d);
    if (!ch) return;
    c.font = `900 ${Math.round(d * 0.6)}px system-ui, sans-serif`;
    if (kind === 'found') {
      c.lineWidth = d * 0.07; c.strokeStyle = 'rgba(120,30,0,0.55)'; c.strokeText(ch, x, y + d * 0.04);
      c.fillStyle = '#fff';
    } else c.fillStyle = kind === 'hint' ? '#c2410c' : '#3b1d5e';
    c.fillText(ch, x, y + d * 0.04);
  }

  function update(dt) {
    introT += dt;
    coinBump = Math.max(0, coinBump - dt * 3);
    shownCoins += (coins - shownCoins) * Math.min(1, dt * 6);
    if (Math.abs(coins - shownCoins) < 0.5) shownCoins = coins;
    if (spin) { spin.t += dt; if (spin.t > 0.45) spin = null; }
    const t = now();
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      if (t < f.t0 + f.dur) continue;
      flying.splice(i, 1);
      if (f.cell) {
        if (!f.cell.found) { f.cell.found = true; f.cell.at = t; }
        Kit.burst(f.x1, f.y1, ACCENT, 5, 0.5);
        Kit.tone(1046 + Math.random() * 300, { type: 'sine', dur: 0.06, vol: 0.07 });
        if (!flying.some((g) => g.cell)) { autoFind(); save(); }
      } else if (f.coin) { coinBump = 1; Kit.burst(f.x1, f.y1, '#ffd23f', 10, 0.6); }
    }
  }

  function draw(c, time) {
    const W = Kit.W, H = Kit.H, t = now();
    Kit.background(c, time, '#6a2c70', '#1b0b2e', 'rgba(255,160,90,0.10)');
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';

    // Title
    const titleX = wide ? G.x + (G.cs * L.gw) / 2 : W / 2;
    const tSize = Math.round(Math.min(H * 0.07, 46));
    c.font = `900 ${tSize}px system-ui, sans-serif`;
    c.lineWidth = 6; c.strokeStyle = 'rgba(30,5,40,0.8)';
    const titleY = wide ? H * 0.075 : H * 0.12;
    c.strokeText(`Level ${level}`, titleX, titleY);
    const lg = c.createLinearGradient(0, titleY - tSize / 2, 0, titleY + tSize / 2);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#ffc06b');
    c.fillStyle = lg; c.fillText(`Level ${level}`, titleX, titleY);

    // Coins and bonus words
    const cb = coinBox();
    c.save();
    c.translate(cb.x + cb.w / 2, cb.y + cb.h / 2); c.scale(1 + coinBump * 0.12, 1 + coinBump * 0.12);
    roundRect(c, -cb.w / 2, -cb.h / 2, cb.w, cb.h, cb.h / 2);
    c.fillStyle = 'rgba(20,5,35,0.55)'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,210,63,0.6)'; c.stroke();
    const coinR = cb.h * 0.36, coinX = -cb.w / 2 + cb.h * 0.5;
    const cg = c.createRadialGradient(coinX - coinR * 0.3, -coinR * 0.3, 1, coinX, 0, coinR);
    cg.addColorStop(0, '#fff3b0'); cg.addColorStop(0.6, '#ffd23f'); cg.addColorStop(1, '#d99a00');
    c.fillStyle = cg; c.beginPath(); c.arc(coinX, 0, coinR, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#b07800'; c.font = `900 ${Math.round(coinR * 1.1)}px system-ui, sans-serif`; c.fillText('★', coinX, coinR * 0.05);
    c.fillStyle = '#fff'; c.font = `900 ${Math.round(cb.h * 0.5)}px system-ui, sans-serif`;
    c.fillText(Math.round(shownCoins), coinX + (cb.w - cb.h) / 2 + coinR * 0.3, 2);
    c.restore();
    c.font = `700 ${Math.round(Math.max(18, Math.min(H * 0.032, 24)))}px system-ui, sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.textAlign = 'right';
    const bl = `Bonus words ${bonusFound.size}/${L.bonus.size}`;
    if (c.measureText(bl).width < cb.x - 30) c.fillText(bl, cb.x - 18, cb.y + cb.h / 2 + 1);
    else { c.textAlign = 'left'; c.fillText(bl, 14, cb.y + cb.h / 2 + 1); }
    c.textAlign = 'center';

    // The crossword
    const cs = G.cs;
    roundRect(c, G.x - cs * 0.2, G.y - cs * 0.2, cs * L.gw + cs * 0.4, cs * L.gh + cs * 0.4, cs * 0.3);
    c.fillStyle = 'rgba(20,5,35,0.35)'; c.fill();
    for (const cell of L.cells.values()) {
      const p = cellXY(cell), age = t - cell.at;
      const pop = age >= 0 && age < 0.35 ? 1 + Math.sin((age / 0.35) * Math.PI) * 0.16 : 1;
      if (cell.found) drawTile(c, 'found', p.x, p.y, cs, cell.ch, pop);
      else if (cell.hint) drawTile(c, 'hint', p.x, p.y, cs, cell.ch, pop);
      else drawTile(c, 'empty', p.x, p.y, cs, '', 1);
    }

    // The word being spelled
    const n = word.length;
    if (n) {
      const fx = wordFx;
      const shakeX = fx && fx.kind === 'bad' && t - fx.t < 0.35 ? Math.sin((t - fx.t) * 60) * tileS * 0.12 : 0;
      for (let i = 0; i < n; i++) {
        const p = tilePos(i, n), age = t - (addT[i] || 0);
        const s = age < 0.25 ? ease.back(clamp(age / 0.25, 0, 1)) : 1;
        const kind = fx && fx.kind === 'bad' ? 'bad' : fx && fx.kind === 'again' ? 'hint' : 'word';
        c.save(); c.translate(p.x + shakeX, p.y); c.scale(s, s);
        roundRect(c, -tileS / 2, -tileS / 2, tileS, tileS, tileS * 0.2);
        c.fillStyle = kind === 'bad' ? '#ff4d6d' : kind === 'hint' ? '#ffd23f' : '#ffffff'; c.fill();
        c.lineWidth = tileS * 0.05; c.strokeStyle = kind === 'bad' ? '#a3122f' : kind === 'hint' ? '#b07800' : '#c9b6e8'; c.stroke();
        c.fillStyle = kind === 'bad' ? '#fff' : '#3b1d5e';
        c.font = `900 ${Math.round(tileS * 0.62)}px system-ui, sans-serif`;
        c.fillText(L.letters[word[i]], 0, tileS * 0.04);
        c.restore();
      }
    } else if (!won) {
      c.font = `700 ${Math.round(Math.max(20, tileS * 0.38))}px system-ui, sans-serif`;
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.fillText(`${found.size} of ${L.words.length} words found`, WH.x, tilesY);
    }

    // The wheel
    const R = WH.r;
    c.save();
    c.beginPath(); c.arc(WH.x, WH.y + R * 0.04, R, 0, Math.PI * 2); c.fillStyle = 'rgba(10,0,20,0.35)'; c.fill();
    const wg = c.createRadialGradient(WH.x - R * 0.3, WH.y - R * 0.35, R * 0.1, WH.x, WH.y, R);
    wg.addColorStop(0, 'rgba(255,255,255,0.97)'); wg.addColorStop(1, 'rgba(232,220,250,0.93)');
    c.beginPath(); c.arc(WH.x, WH.y, R, 0, Math.PI * 2); c.fillStyle = wg; c.fill();
    c.lineWidth = Math.max(3, R * 0.025); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
    c.restore();
    // The line through the chosen letters
    if (n) {
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      word.forEach((li, i) => { const p = letterPos(li); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); });
      c.strokeStyle = 'rgba(255,123,41,0.85)'; c.lineWidth = WH.lr * 0.32; c.stroke();
    }
    const n2 = L.letters.length;
    for (let li = 0; li < n2; li++) {
      const p = letterPos(li), used = word.indexOf(li);
      if (used >= 0) {
        const age = t - (addT[used] || 0), s = age < 0.25 ? 1 + Math.sin((age / 0.25) * Math.PI) * 0.15 : 1;
        c.beginPath(); c.arc(p.x, p.y, WH.lr * s, 0, Math.PI * 2);
        const g = c.createLinearGradient(0, p.y - WH.lr, 0, p.y + WH.lr);
        g.addColorStop(0, '#ffb066'); g.addColorStop(1, '#e8590c');
        c.fillStyle = g; c.fill();
      }
      c.font = `900 ${Math.round(WH.lr * 1.25)}px system-ui, sans-serif`;
      c.fillStyle = used >= 0 ? '#fff' : '#3b1d5e';
      c.fillText(L.letters[li], p.x, p.y + WH.lr * 0.07);
    }
    // The remote's focus: a glowing ring on a letter, or round a button.
    const showFocus = !won && !Kit.touchFirst();
    if (showFocus && focus < n2 && !spin) {
      const p = slotPos(focus), pr = WH.lr * 1.12 + Math.sin(time * 6) * 2;
      c.beginPath(); c.arc(p.x, p.y, pr + 4, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,210,63,0.35)'; c.lineWidth = 10; c.stroke();
      c.beginPath(); c.arc(p.x, p.y, pr, 0, Math.PI * 2); c.strokeStyle = '#ffd23f'; c.lineWidth = 4; c.stroke();
    }

    // Letters on their way into the grid (or to the coins)
    for (const f of flying) {
      const k = clamp((t - f.t0) / f.dur, 0, 1);
      if (t < f.t0) { drawTile(c, 'hint', f.x0, f.y0, f.s0, f.ch); continue; }
      const e = ease.inOut(k);
      const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * H * 0.08;
      drawTile(c, f.cell ? 'found' : 'hint', x, y, lerp(f.s0, f.s1, e), f.ch);
    }

    // Buttons
    buttons.forEach((b, i) => {
      const on = showFocus && focus === n2 + i;
      const off = (b.id === 'clear' && !n) || (b.id === 'hint' && coins < HINT_COST);
      roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
      const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, on ? '#ffe45c' : 'rgba(255,255,255,0.18)'); g.addColorStop(1, on ? '#ffb703' : 'rgba(255,255,255,0.07)');
      c.fillStyle = g; c.fill();
      c.lineWidth = on ? 3 : 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.28)'; c.stroke();
      const label = b.id === 'hint' ? `${b.label} ${HINT_COST}` : b.label;
      c.font = `800 ${Math.round(Math.min(b.h * 0.4, b.w * 0.15))}px system-ui, sans-serif`;
      c.fillStyle = on ? '#2b1600' : off ? 'rgba(255,255,255,0.4)' : '#fff';
      c.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    });

    // How to play
    const hs = Math.round(Math.max(18, Math.min(H * 0.032, 24)));
    c.font = `700 ${hs}px system-ui, sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.62)';
    const tip = Kit.touchFirst() ? 'Swipe or tap letters · tap the word to enter it'
      : focus >= n2 ? '◀ ▶ move · OK press · ▲ back to the letters · Back exits'
        : '◀ ▶ choose a letter · OK add · ▼ enter word · ▲ remove letter · Back exits';
    const tw = c.measureText(tip).width;
    if (tw > W * 0.95) c.font = `700 ${Math.floor(hs * (W * 0.95) / tw)}px system-ui, sans-serif`;
    c.fillText(tip, W / 2, H - hs * 1.1);

    const m = muteBox();
    c.font = `${Math.round(m.h * 0.55)}px system-ui, sans-serif`;
    c.globalAlpha = 0.7; c.fillStyle = '#fff';
    c.fillText(Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2);
    c.globalAlpha = 1;

    if (introT < 6 && level <= 2 && found.size === 0 && !n) {
      c.globalAlpha = Math.min(1, introT * 2, (6 - introT) * 2);
      c.font = `800 ${Math.round(Math.max(20, Math.min(H * 0.036, 26)))}px system-ui, sans-serif`;
      c.fillStyle = '#fff59d';
      c.fillText('Make words from the wheel to fill the grid!', titleX, G.y - G.cs * 0.2 - Math.max(20, H * 0.03));
      c.globalAlpha = 1;
    }

    if (won && t - wonT > 0.6) {
      const a = clamp((t - wonT - 0.6) / 0.4, 0, 1);
      c.fillStyle = `rgba(20,4,30,${0.6 * a})`; c.fillRect(0, 0, W, H);
      c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
      const pw = Math.min(W * 0.84, 560), ph = Math.min(H * 0.56, 320);
      roundRect(c, -pw / 2, -ph / 2, pw, ph, 28);
      const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
      g.addColorStop(0, '#c2417a'); g.addColorStop(1, '#5a1a6e');
      c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd23f'; c.stroke();
      c.font = `900 ${Math.round(ph * 0.14)}px system-ui, sans-serif`; c.fillStyle = '#fff';
      c.fillText('Level complete!', 0, -ph * 0.28);
      c.font = `800 ${Math.round(ph * 0.09)}px system-ui, sans-serif`; c.fillStyle = '#ffd23f';
      c.fillText(`★ +${LEVEL_COINS} coins`, 0, -ph * 0.07);
      c.font = `700 ${Math.round(ph * 0.075)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillText(`Bonus words found: ${bonusFound.size} of ${L.bonus.size}`, 0, ph * 0.1);
      c.fillStyle = '#fff59d';
      c.fillText(Kit.touchFirst() ? 'Tap for the next level' : 'Press OK for the next level', 0, ph * 0.31);
      c.restore();
    }
  }

  // ---------- Start ----------
  load(false);
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout();
  Kit.canvas.focus();
  if (level > 1) Kit.record('wordwheel', level - 1);
})();
