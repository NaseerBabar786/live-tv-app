// Word Wheel: spell words from the letters on the wheel to fill the little crossword. Every word in the
// grid uses the wheel's letters, each letter at most once; the longest uses them all. Real words that
// are not in the grid are bonus words and earn coins, and coins buy hints.
// Remote: Left/Right go round the wheel, OK adds the lit letter, Down enters the word, Up takes the last
// letter back. Shuffle, Hint and Clear sit under the wheel (Left/Right reach them too; Down with no
// word jumps there). Touch and mouse: tap or swipe the letters, tap the word to enter it.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp, rgba } = Kit;

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
    const cs = Math.min(gwid / (L.gw + 0.9), ghei / (L.gh + 0.9), H * 0.13); // room for the frame
    G.cs = cs; G.x = gx + (gwid - cs * L.gw) / 2; G.y = gy + (ghei - cs * L.gh) / 2;
    const n = L.letters.length;
    WH.rr = WH.r * (n <= 4 ? 0.56 : 0.64);
    WH.lr = Math.min(WH.r * 0.27, WH.rr * Math.sin(Math.PI / n) * 0.84);
    const gap = Math.min(16, W * 0.012), total = BUTTONS.length * bw + (BUTTONS.length - 1) * gap;
    buttons = BUTTONS.map((b, i) => ({ ...b, x: bcx - total / 2 + i * (bw + gap), y: by, w: bw, h: bh }));
    board = null; wheelImg = null; sprites.clear(); glassCache.clear();
  }
  Kit.onResize(() => { scene = null; layout(); });
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
      const ph = Math.min(Kit.H * 0.6, 360);
      for (let i = 0; i < 3; i++) setTimeout(() => sparkle(Kit.W / 2 + (i - 1) * ph * 0.27, Kit.H / 2 - ph * 0.1, 16, '#ffe066', 1.2), 1050 + i * 250);
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
    sparkle(p.x, p.y, 14, '#ffe066');
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
  // Everything heavy (the landscape, the framed board with its empty sockets, the wheel, tiles and
  // letter balls) is painted once into offscreen pictures and re-baked on resize; a frame is mostly
  // drawImage plus a few glowing strokes.
  const F = Kit.FONT, U = Kit.UI;
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function mk(w, h, dpr = DPR()) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * dpr)); cv.height = Math.max(1, Math.ceil(h * dpr));
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    return { cv, c };
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
  let scene = null, board = null, wheelImg = null, rays = null, glowDot = null;
  const sprites = new Map();
  // A rounded rectangle added to the current path (no beginPath), for cut-outs.
  function rrAdd(c, x, y, w, h, r) {
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function invalidate() { scene = null; board = null; wheelImg = null; sprites.clear(); glassCache.clear(); }
  let seedN = 1;
  const srand = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };

  // The magical landscape: dusk sky, stars, a low sun, misty mountains, rolling hills with trees.
  function bakeScene(W, H) {
    const { cv, c } = mk(W, H, 1);
    seedN = 4242;
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1d1450'); sky.addColorStop(0.3, '#4b2a8c'); sky.addColorStop(0.55, '#b0569e');
    sky.addColorStop(0.68, '#f39a8a'); sky.addColorStop(0.78, '#ffd39a'); sky.addColorStop(1, '#ffd39a');
    c.fillStyle = sky; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 110; i++) {
      const x = srand() * W, y = srand() * H * 0.45, r = 0.5 + srand() * 1.4;
      c.globalAlpha = (0.25 + srand() * 0.6) * (1 - y / (H * 0.5));
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    const sx = W * 0.62, sy = H * 0.66;
    let g = c.createRadialGradient(sx, sy, 0, sx, sy, H * 0.75);
    g.addColorStop(0, 'rgba(255,240,200,0.85)'); g.addColorStop(0.15, 'rgba(255,200,150,0.45)'); g.addColorStop(1, 'rgba(255,160,160,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff6e0'; c.beginPath(); c.arc(sx, sy, H * 0.06, 0, Math.PI * 2); c.fill();
    // a layer of hills: a wavy ridge filled with a lit gradient and a bright rim
    const ridge = (base, amp, waves, top, bottom, rim, trees) => {
      const ph = srand() * 10, pts = [];
      for (let x = -10; x <= W + 10; x += 8) {
        let y = base;
        waves.forEach(([f, a], i) => { y -= Math.sin(x / W * Math.PI * f + ph * (i + 1)) * amp * a; });
        pts.push([x, y]);
      }
      c.beginPath(); c.moveTo(-10, H + 10);
      pts.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(W + 10, H + 10); c.closePath();
      const hg = c.createLinearGradient(0, base - amp, 0, H);
      hg.addColorStop(0, top); hg.addColorStop(1, bottom);
      c.fillStyle = hg; c.fill();
      c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.strokeStyle = rim; c.lineWidth = 2.5; c.stroke();
      if (trees) {
        for (let k = 0; k < trees; k++) {
          const [x, y] = pts[Math.floor(srand() * pts.length)], s = H * (0.018 + srand() * 0.02);
          c.fillStyle = shade(bottom, -0.25);
          c.fillRect(x - s * 0.12, y - s * 0.4, s * 0.24, s * 0.8);
          const tg = c.createRadialGradient(x - s * 0.3, y - s * 1.3, s * 0.1, x, y - s, s * 1.1);
          tg.addColorStop(0, shade(top, 0.15)); tg.addColorStop(1, shade(bottom, -0.15));
          c.fillStyle = tg; c.beginPath(); c.ellipse(x, y - s * 1.05, s * 0.75, s * 1.0, 0, 0, Math.PI * 2); c.fill();
        }
      }
    };
    ridge(H * 0.64, H * 0.12, [[3, 1], [7, 0.35]], '#9a6fb8', '#d99aa8', 'rgba(255,220,230,0.35)', 0);
    ridge(H * 0.72, H * 0.06, [[2, 1], [5, 0.5]], '#5f8fb0', '#4c6f8e', 'rgba(255,230,200,0.45)', 0);
    // mist
    g = c.createLinearGradient(0, H * 0.66, 0, H * 0.82);
    g.addColorStop(0, 'rgba(255,230,240,0)'); g.addColorStop(0.5, 'rgba(255,230,240,0.35)'); g.addColorStop(1, 'rgba(255,230,240,0)');
    c.fillStyle = g; c.fillRect(0, H * 0.66, W, H * 0.16);
    ridge(H * 0.8, H * 0.05, [[2.5, 1], [6, 0.4]], '#4fae7a', '#2c7354', 'rgba(255,240,180,0.6)', 14);
    ridge(H * 0.9, H * 0.05, [[1.6, 1], [4, 0.5]], '#3b8f5e', '#1b4a35', 'rgba(255,240,180,0.55)', 10);
    // vignette
    g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(10,0,25,0)'); g.addColorStop(1, 'rgba(10,0,25,0.6)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    scene = { cv, sx, sy };
    // soft sun rays, turned slowly each frame
    const R = Math.max(W, H) * 0.5, rr = mk(R * 2, R * 2, 0.5);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, w = 0.07 + (i % 3) * 0.03;
      const rg = rr.c.createRadialGradient(R, R, 0, R, R, R);
      rg.addColorStop(0, 'rgba(255,240,200,0.5)'); rg.addColorStop(1, 'rgba(255,240,200,0)');
      rr.c.fillStyle = rg; rr.c.beginPath(); rr.c.moveTo(R, R); rr.c.arc(R, R, R, a - w, a + w); rr.c.closePath(); rr.c.fill();
    }
    rays = { cv: rr.cv, R };
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.12;
    c.drawImage(rr.cv, sx - R, sy - R, R * 2, R * 2); c.restore();
    const gd = mk(32, 32);
    const dg = gd.c.createRadialGradient(16, 16, 0, 16, 16, 16);
    dg.addColorStop(0, 'rgba(255,255,230,1)'); dg.addColorStop(0.25, 'rgba(255,230,150,0.6)'); dg.addColorStop(1, 'rgba(255,200,120,0)');
    gd.c.fillStyle = dg; gd.c.fillRect(0, 0, 32, 32);
    glowDot = gd.cv;
  }
  // Clouds drift across the sky: three soft cloud pictures.
  let clouds = null;
  function bakeClouds(H) {
    clouds = [0, 1, 2].map((k) => {
      const w = H * (0.42 + k * 0.08), h = w * 0.5, { cv, c } = mk(w, h, 0.5);
      seedN = 77 + k * 13;
      // puffs: a wide base row and a few bigger ones on top, each with a soft edge
      const puffs = [];
      for (let i = 0; i < 6; i++) puffs.push([w * (0.14 + i * 0.145), h * 0.7, h * (0.16 + srand() * 0.05)]);
      for (let i = 0; i < 3; i++) puffs.push([w * (0.3 + i * 0.2 + (srand() - 0.5) * 0.06), h * (0.5 - (i === 1 ? 0.08 : 0)), h * (0.24 + srand() * 0.06)]);
      c.fillStyle = 'rgba(255,248,252,0.92)';
      c.beginPath();
      for (const [x, y, r] of puffs) { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); }
      c.shadowColor = 'rgba(255,240,248,0.95)'; c.shadowBlur = h * 0.05; // soft, feathered edge (baked once)
      c.fill('nonzero'); c.fill('nonzero');
      c.shadowColor = 'transparent';
      // sunlit tops of the puffs
      c.globalCompositeOperation = 'source-atop';
      for (const [x, y, r] of puffs) {
        const g = c.createRadialGradient(x - r * 0.2, y - r * 0.55, 0, x - r * 0.2, y - r * 0.55, r * 0.8);
        g.addColorStop(0, 'rgba(255,255,240,0.9)'); g.addColorStop(1, 'rgba(255,255,240,0)');
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // shade the underside with the sunset tint, only where there is cloud
      const sh = c.createLinearGradient(0, h * 0.3, 0, h * 0.95);
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.55, 'rgba(230,160,200,0.45)'); sh.addColorStop(1, 'rgba(170,110,170,0.75)');
      c.fillStyle = sh; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'source-over';
      return { cv, w, h, y: H * (0.06 + k * 0.1), speed: 6 + k * 4, x0: k * 0.37 };
    });
  }
  const motes = Array.from({ length: 16 }, () => ({ x: Math.random(), y: 0.3 + Math.random() * 0.7, s: 0.3 + Math.random() * 0.7, p: Math.random() * 6 }));

  // The framed board: a thick polished-wood frame with gold studs, a dark glass inlay and recessed sockets.
  function bakeBoard() {
    const cs = G.cs, fp = cs * 0.42, ft = cs * 0.26;
    const bw = cs * L.gw + fp * 2, bh = cs * L.gh + fp * 2, m = cs * 0.6;
    const { cv, c } = mk(bw + m * 2, bh + m * 2);
    c.translate(m, m);
    seedN = 99;
    c.save(); c.shadowColor = 'rgba(20,0,30,0.55)'; c.shadowBlur = cs * 0.6; c.shadowOffsetY = cs * 0.22;
    roundRect(c, 0, 0, bw, bh, cs * 0.35); c.fillStyle = '#6b3a1c'; c.fill(); c.restore();
    let g = c.createLinearGradient(0, 0, bw, bh);
    g.addColorStop(0, '#c98a4f'); g.addColorStop(0.45, '#9a5a2c'); g.addColorStop(1, '#6e3a18');
    roundRect(c, 0, 0, bw, bh, cs * 0.35); c.fillStyle = g; c.fill();
    c.save(); roundRect(c, 0, 0, bw, bh, cs * 0.35); c.clip();
    for (let i = 0; i < 40; i++) { // wood grain
      const y = srand() * bh; c.strokeStyle = `rgba(60,25,5,${0.08 + srand() * 0.12})`; c.lineWidth = 1 + srand() * 2;
      c.beginPath(); c.moveTo(0, y);
      c.bezierCurveTo(bw * 0.3, y + (srand() - 0.5) * cs * 0.4, bw * 0.6, y + (srand() - 0.5) * cs * 0.4, bw, y + (srand() - 0.5) * cs * 0.3); c.stroke();
    }
    c.restore();
    c.lineWidth = Math.max(2, cs * 0.04); c.strokeStyle = 'rgba(255,220,170,0.6)';
    roundRect(c, 1.5, 1.5, bw - 3, bh - 3, cs * 0.34); c.stroke();
    // inlay
    const ix = ft, iy = ft, iw = bw - ft * 2, ih = bh - ft * 2, ir = cs * 0.22;
    g = c.createLinearGradient(0, iy, 0, iy + ih);
    g.addColorStop(0, '#2b1650'); g.addColorStop(1, '#170a2c');
    roundRect(c, ix, iy, iw, ih, ir); c.fillStyle = g; c.fill();
    c.save(); roundRect(c, ix, iy, iw, ih, ir); c.clip();
    c.shadowColor = 'rgba(0,0,0,0.85)'; c.shadowBlur = cs * 0.35; c.shadowOffsetY = cs * 0.08;
    c.beginPath(); c.rect(ix - cs, iy - cs, iw + cs * 2, ih + cs * 2); rrAdd(c, ix, iy, iw, ih, ir);
    c.fillStyle = '#000'; c.fill('evenodd');
    c.shadowColor = 'transparent';
    g = c.createLinearGradient(ix, iy, ix + iw * 0.6, iy + ih);
    g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.5, 'rgba(255,255,255,0.02)'); g.addColorStop(0.51, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(ix, iy, iw, ih);
    c.restore();
    c.lineWidth = 2; c.strokeStyle = 'rgba(60,25,5,0.8)'; roundRect(c, ix, iy, iw, ih, ir); c.stroke();
    // gold studs
    [[ft / 2, ft / 2], [bw - ft / 2, ft / 2], [ft / 2, bh - ft / 2], [bw - ft / 2, bh - ft / 2]].forEach(([x, y]) => {
      const sg = c.createRadialGradient(x - ft * 0.12, y - ft * 0.12, 1, x, y, ft * 0.32);
      sg.addColorStop(0, '#fff6c8'); sg.addColorStop(0.5, '#f0b93a'); sg.addColorStop(1, '#8a5a0e');
      c.fillStyle = sg; c.beginPath(); c.arc(x, y, ft * 0.3, 0, Math.PI * 2); c.fill();
    });
    // empty sockets
    for (const cell of L.cells.values()) {
      const x = fp + cell.c * cs + cs * 0.06, y = fp + cell.r * cs + cs * 0.06, s = cs * 0.88, r = s * 0.2;
      roundRect(c, x, y, s, s, r); c.fillStyle = 'rgba(8,2,20,0.55)'; c.fill();
      c.save(); roundRect(c, x, y, s, s, r); c.clip();
      c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = s * 0.18; c.shadowOffsetY = s * 0.07;
      c.beginPath(); c.rect(x - s, y - s, s * 3, s * 3); rrAdd(c, x, y, s, s, r); c.fillStyle = '#000'; c.fill('evenodd');
      c.restore();
      c.lineWidth = Math.max(1.5, s * 0.025); c.strokeStyle = 'rgba(200,170,255,0.22)'; roundRect(c, x, y + 1, s, s, r); c.stroke();
    }
    board = { cv, x: G.x - fp - m, y: G.y - fp - m, w: bw + m * 2, h: bh + m * 2, fx: G.x - fp, fy: G.y - fp, bw, bh };
  }

  // A thick glossy letter tile with a side, contact shadow and specular; [kind] picks the material.
  const TILE = {
    found: ['#ffe08a', '#ffa83a', '#e8650f', '#a8400a'],
    hint: ['#fffdf6', '#f5ead6', '#d9c6a6', '#9c845e'],
    word: ['#fffdf6', '#f5ead6', '#d9c6a6', '#9c845e'],
    bad: ['#ff9aa8', '#ff4d6d', '#c81e43', '#7d0f28'],
    again: ['#fff2a8', '#ffd23f', '#e0a400', '#8a6200'],
  };
  function tileSprite(kind, size, ch = '') {
    const key = kind + Math.round(size) + ch;
    let s = sprites.get(key);
    if (s) return s;
    if (sprites.size > 400) sprites.clear();
    const pad = size * 0.2, { cv, c } = mk(size + pad * 2, size + pad * 2);
    c.translate(pad, pad);
    const [hi, mid, lo, side] = TILE[kind], r = size * 0.2, th = size * 0.08;
    const x = size * 0.04, w = size * 0.92, y = size * 0.02, h = size * 0.88;
    // contact shadow
    const sg = c.createRadialGradient(size / 2, y + h + th, 0, size / 2, y + h + th, w * 0.6);
    sg.addColorStop(0, 'rgba(0,0,0,0.45)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg; c.fillRect(-pad, y + h * 0.5, size + pad * 2, h);
    roundRect(c, x, y + th, w, h, r); c.fillStyle = side; c.fill();
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, hi); g.addColorStop(0.45, mid); g.addColorStop(1, lo);
    roundRect(c, x, y, w, h, r); c.fillStyle = g; c.fill();
    c.lineWidth = size * 0.03; c.strokeStyle = 'rgba(255,255,255,0.7)'; roundRect(c, x + size * 0.03, y + size * 0.03, w - size * 0.06, h - size * 0.06, r * 0.85); c.stroke();
    const sp = c.createLinearGradient(0, y, 0, y + h * 0.5);
    sp.addColorStop(0, 'rgba(255,255,255,0.75)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    roundRect(c, x + w * 0.1, y + h * 0.06, w * 0.8, h * 0.36, r * 0.7); c.fillStyle = sp; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(x + w * 0.2, y + h * 0.2, size * 0.035, 0, Math.PI * 2); c.fill();
    if (ch) { // the letter is baked in too
      const [fill, stroke] = INK[kind];
      c.font = `700 ${Math.round(size * 0.58)}px ${F}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      if (stroke) { c.lineWidth = size * 0.07; c.strokeStyle = stroke; c.strokeText(ch, size / 2, size * 0.45); }
      c.fillStyle = fill; c.fillText(ch, size / 2, size * 0.45);
    }
    s = { cv, pad };
    sprites.set(key, s);
    return s;
  }
  const INK = { found: ['#fff', 'rgba(140,40,0,0.75)'], hint: ['#d9480f', null], word: ['#3b1d5e', null], bad: ['#fff', 'rgba(120,0,20,0.6)'], again: ['#5a3a00', null] };
  function drawTile(c, kind, x, y, size, ch, sx = 1, sy = 1) {
    // sizes are rounded so flying letters reuse a few pictures
    const s = tileSprite(kind, Math.round(size / 4) * 4 || 4, ch), full = size * (1 + (s.pad * 2) / (Math.round(size / 4) * 4 || 4));
    if (sx === 1 && sy === 1) { c.drawImage(s.cv, x - full / 2, y - full / 2, full, full); return; }
    c.save(); c.translate(x, y + size * 0.45); c.scale(sx, sy);
    c.drawImage(s.cv, -full / 2, -full / 2 - size * 0.45, full, full);
    c.restore();
  }

  // The wheel: a gold-rimmed velvet disc with studs and an engraved star.
  function bakeWheel() {
    const R = WH.r, m = R * 0.25, { cv, c } = mk((R + m) * 2, (R + m) * 2);
    c.translate(R + m, R + m);
    c.save(); c.shadowColor = 'rgba(20,0,30,0.6)'; c.shadowBlur = R * 0.25; c.shadowOffsetY = R * 0.08;
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = '#7a4a10'; c.fill(); c.restore();
    let g = c.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, '#fff3c0'); g.addColorStop(0.25, '#f2c04a'); g.addColorStop(0.5, '#9c6614'); g.addColorStop(0.72, '#f5cf62'); g.addColorStop(1, '#7a4a0c');
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    const ri = R * 0.88;
    g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.05, 0, 0, ri);
    g.addColorStop(0, '#8a4fd0'); g.addColorStop(0.6, '#4a1f88'); g.addColorStop(1, '#2a0d52');
    c.beginPath(); c.arc(0, 0, ri, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, ri, 0, Math.PI * 2); c.clip();
    c.shadowColor = 'rgba(0,0,0,0.85)'; c.shadowBlur = R * 0.12; c.shadowOffsetY = R * 0.03;
    c.beginPath(); c.arc(0, 0, ri + R, 0, Math.PI * 2); c.arc(0, 0, ri, 0, Math.PI * 2, true); c.fillStyle = '#000'; c.fill();
    c.restore();
    // engraved rings and star
    c.strokeStyle = 'rgba(255,215,120,0.22)'; c.lineWidth = Math.max(1.5, R * 0.012);
    [0.3, 0.78].forEach((k) => { c.beginPath(); c.arc(0, 0, ri * k, 0, Math.PI * 2); c.stroke(); });
    c.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? ri * 0.1 : ri * 0.26; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath(); c.fillStyle = 'rgba(255,215,120,0.16)'; c.fill();
    // studs round the rim
    const sr = R * 0.032;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, x = Math.cos(a) * R * 0.94, y = Math.sin(a) * R * 0.94;
      const sg = c.createRadialGradient(x - sr * 0.4, y - sr * 0.4, 0.5, x, y, sr);
      sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.5, '#ffd66b'); sg.addColorStop(1, '#8a5a0e');
      c.fillStyle = sg; c.beginPath(); c.arc(x, y, sr, 0, Math.PI * 2); c.fill();
    }
    c.lineWidth = Math.max(2, R * 0.015); c.strokeStyle = 'rgba(255,250,220,0.8)';
    c.beginPath(); c.arc(0, 0, R - 1, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
    wheelImg = { cv, s: (R + m) * 2 };
  }
  // A glossy letter ball: pearl when free, gold when chosen.
  function ballSprite(kind, r) {
    const key = 'ball' + kind + Math.round(r);
    let s = sprites.get(key);
    if (s) return s;
    const m = r * 0.35, { cv, c } = mk((r + m) * 2, (r + m) * 2);
    c.translate(r + m, r + m);
    const sh = c.createRadialGradient(0, r * 0.75, 0, 0, r * 0.75, r * 1.1);
    sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh; c.beginPath(); c.ellipse(0, r * 0.8, r * 1.05, r * 0.45, 0, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
    if (kind === 'gold') { g.addColorStop(0, '#fff6c8'); g.addColorStop(0.35, '#ffbe45'); g.addColorStop(0.85, '#e0620f'); g.addColorStop(1, '#9c3a06'); }
    else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#f6efff'); g.addColorStop(0.85, '#c7b2ea'); g.addColorStop(1, '#8d74b8'); }
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = kind === 'gold' ? 'rgba(255,220,150,0.45)' : 'rgba(255,255,255,0.5)'; c.lineWidth = r * 0.045;
    c.beginPath(); c.arc(0, 0, r * 0.93, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
    const sp = c.createLinearGradient(0, -r, 0, -r * 0.1);
    sp.addColorStop(0, 'rgba(255,255,255,0.85)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sp; c.beginPath(); c.ellipse(-r * 0.1, -r * 0.52, r * 0.62, r * 0.36, -0.2, 0, Math.PI * 2); c.fill();
    s = { cv, size: (r + m) * 2 };
    sprites.set(key, s);
    return s;
  }
  // A drawn gold coin with a star.
  function coinSprite(r) {
    const key = 'coin' + Math.round(r);
    let s = sprites.get(key);
    if (s) return s;
    const { cv, c } = mk(r * 2.4, r * 2.4);
    c.translate(r * 1.2, r * 1.2);
    c.fillStyle = '#9c6200'; c.beginPath(); c.arc(0, r * 0.1, r, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r);
    g.addColorStop(0, '#fffbe0'); g.addColorStop(0.45, '#ffd23f'); g.addColorStop(1, '#d08a00');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(160,100,0,0.8)'; c.lineWidth = r * 0.1; c.beginPath(); c.arc(0, 0, r * 0.74, 0, Math.PI * 2); c.stroke();
    starPath(c, 0, 0, r * 0.48, r * 0.2); c.fillStyle = '#c07a00'; c.fill();
    starPath(c, -r * 0.03, -r * 0.05, r * 0.44, r * 0.18); c.fillStyle = '#fff1a8'; c.fill();
    s = { cv, size: r * 2.4 };
    sprites.set(key, s);
    return s;
  }
  function starPath(c, x, y, R, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, d = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
    c.closePath();
  }
  // Star-shaped sparkles that glow (added light).
  const sparks = [];
  function sparkle(x, y, n, color = '#ffe08a', speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (40 + Math.random() * 200) * speed;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0, max: 0.5 + Math.random() * 0.5, s: 5 + Math.random() * 9, color, rot: Math.random() * 3 });
    }
  }
  // Canvas-drawn button icons.
  function icon(c, id, x, y, s, col) {
    c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * 0.14; c.lineCap = 'round'; c.lineJoin = 'round';
    if (id === 'shuffle') {
      c.beginPath(); c.moveTo(-s * 0.5, -s * 0.3); c.bezierCurveTo(0, -s * 0.3, 0, s * 0.3, s * 0.45, s * 0.3); c.stroke();
      c.beginPath(); c.moveTo(-s * 0.5, s * 0.3); c.bezierCurveTo(0, s * 0.3, 0, -s * 0.3, s * 0.45, -s * 0.3); c.stroke();
      [[s * 0.45, -s * 0.3], [s * 0.45, s * 0.3]].forEach(([ax, ay]) => { c.beginPath(); c.moveTo(ax + s * 0.12, ay); c.lineTo(ax - s * 0.1, ay - s * 0.16); c.lineTo(ax - s * 0.1, ay + s * 0.16); c.closePath(); c.fill(); });
    } else if (id === 'hint') {
      c.beginPath(); c.arc(0, -s * 0.12, s * 0.32, Math.PI * 0.8, Math.PI * 2.2); c.lineTo(s * 0.12, s * 0.28); c.lineTo(-s * 0.12, s * 0.28); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(-s * 0.12, s * 0.44); c.lineTo(s * 0.12, s * 0.44); c.stroke();
    } else {
      c.beginPath(); c.moveTo(-s * 0.3, -s * 0.3); c.lineTo(s * 0.3, s * 0.3); c.moveTo(s * 0.3, -s * 0.3); c.lineTo(-s * 0.3, s * 0.3); c.stroke();
    }
    c.restore();
  }
  // A ribbon banner with folded ends.
  function ribbon(c, x, y, w, h, text, size) {
    const e = h * 0.7;
    c.fillStyle = '#8f1d4a';
    [-1, 1].forEach((d) => {
      c.beginPath(); c.moveTo(x + d * (w / 2 - e * 0.3), y - h * 0.2); c.lineTo(x + d * (w / 2 + e), y - h * 0.2);
      c.lineTo(x + d * (w / 2 + e * 0.6), y + h * 0.3); c.lineTo(x + d * (w / 2 + e), y + h * 0.8); c.lineTo(x + d * (w / 2 - e * 0.3), y + h * 0.8); c.closePath(); c.fill();
    });
    const g = c.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, '#ff7aa8'); g.addColorStop(0.5, '#e8336f'); g.addColorStop(1, '#a8174c');
    roundRect(c, x - w / 2, y - h / 2, w, h, h * 0.18); c.fillStyle = g; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)'; roundRect(c, x - w / 2 + 6, y - h / 2 + 4, w - 12, h * 0.32, h * 0.12); c.fill();
    title(c, text, x, y + 2, size, { color: '#fff4d6' });
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
        sparkle(f.x1, f.y1, 6, '#ffd27a', 0.7);
        Kit.tone(1046 + Math.random() * 300, { type: 'sine', dur: 0.06, vol: 0.07 });
        if (!flying.some((g) => g.cell)) { autoFind(); save(); }
      } else if (f.coin) { coinBump = 1; sparkle(f.x1, f.y1, 12, '#ffe066', 0.8); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.life += dt;
      if (p.life > p.max) { sparks.splice(i, 1); continue; }
      p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.rot += dt * 4;
    }
  }

  function draw(c, time) {
    checkFonts(time);
    const W = Kit.W, H = Kit.H, t = now();
    if (!scene) { bakeScene(W, H); bakeClouds(H); }
    if (!board) bakeBoard();
    if (!wheelImg) bakeWheel();
    c.drawImage(scene.cv, 0, 0, W, H);
    // slow sun rays and drifting clouds
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.12 + 0.04 * Math.sin(time * 0.8);
    c.translate(scene.sx, scene.sy); c.rotate(time * 0.05);
    const hr = H * 0.22; c.drawImage(rays.cv, -hr, -hr, hr * 2, hr * 2);
    c.restore();
    for (const cl of clouds) {
      const span = W + cl.w * 2, x = ((cl.x0 * span + time * cl.speed) % span) - cl.w;
      c.drawImage(cl.cv, x, cl.y, cl.w, cl.h);
    }
    c.globalAlpha = 1;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';

    // Title
    const titleX = wide ? G.x + (G.cs * L.gw) / 2 : W / 2;
    const titleY = wide ? Math.max(H * 0.07, board.fy - H * 0.06) : H * 0.12;
    title(c, `Level ${level}`, titleX, titleY, Math.round(Math.min(H * 0.07, 50)), { color: '#ffd27a', glow: 'rgba(255,160,80,0.6)' });

    // Coins and bonus words
    const cb = coinBox();
    c.save();
    c.translate(cb.x + cb.w / 2, cb.y + cb.h / 2); c.scale(1 + coinBump * 0.12, 1 + coinBump * 0.12);
    glass(c, -cb.w / 2, -cb.h / 2, cb.w, cb.h, cb.h / 2, { tint: 'rgba(60,20,90,0.35)', edge: 'rgba(255,220,140,0.6)' });
    const coin = coinSprite(cb.h * 0.42), coinX = -cb.w / 2 + cb.h * 0.48;
    c.drawImage(coin.cv, coinX - coin.size / 2, -coin.size / 2, coin.size, coin.size);
    title(c, String(Math.round(shownCoins)), coinX + (cb.w - cb.h) / 2 + cb.h * 0.15, 2, Math.round(cb.h * 0.52), { color: '#fff1b0' });
    c.restore();
    const bfs = Math.round(Math.max(18, Math.min(H * 0.03, 24)));
    c.font = `600 ${bfs}px ${U}`;
    const bl = `Bonus ${bonusFound.size}/${L.bonus.size}`, blw = c.measureText(bl).width + bfs * 2.4;
    const blx = cb.x - blw - 14 > 10 ? cb.x - blw - 14 : 12;
    glass(c, blx, cb.y + (cb.h - bfs * 1.9) / 2, blw, bfs * 1.9, bfs * 0.95, { tint: 'rgba(60,20,90,0.35)' });
    starPath(c, blx + bfs * 1.05, cb.y + cb.h / 2, bfs * 0.5, bfs * 0.22); c.fillStyle = '#ffd23f'; c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(bl, blx + bfs * 1.8, cb.y + cb.h / 2 + 1); c.textAlign = 'center';

    // The framed crossword
    c.drawImage(board.cv, board.x, board.y, board.w, board.h);
    const cs = G.cs;
    const sweep = ((time % 5) / 1.4) * (board.bw + board.bh) - board.bh; // a shine passes every few seconds
    for (const cell of L.cells.values()) {
      if (!cell.found && !cell.hint) continue;
      const p = cellXY(cell), age = t - cell.at;
      let sx = 1, sy = 1;
      if (age >= 0 && age < 0.45) { const k = age / 0.45, w = Math.sin(k * Math.PI) * (1 - k); sx = 1 + w * 0.35; sy = 1 - w * 0.3; }
      drawTile(c, cell.found ? 'found' : 'hint', p.x, p.y, cs, cell.ch, sx, sy);
      const d = (p.x - board.fx) + (p.y - board.fy) - sweep;
      if (cell.found && Math.abs(d) < cs * 0.7) {
        c.save(); roundRect(c, p.x - cs * 0.42, p.y - cs * 0.42, cs * 0.84, cs * 0.8, cs * 0.18); c.clip();
        c.globalCompositeOperation = 'lighter';
        c.translate(p.x - d / 2, p.y - d / 2); c.rotate(-Math.PI / 4);
        const g = c.createLinearGradient(-cs * 0.3, 0, cs * 0.3, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,230,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(-cs * 0.3, -cs, cs * 0.6, cs * 2);
        c.restore();
      }
    }

    // The word being spelled
    const n = word.length;
    if (n) {
      const fx = wordFx;
      const shakeX = fx && fx.kind === 'bad' && t - fx.t < 0.35 ? Math.sin((t - fx.t) * 60) * tileS * 0.12 : 0;
      const kind = fx && fx.kind === 'bad' ? 'bad' : fx && fx.kind === 'again' ? 'again' : 'word';
      for (let i = 0; i < n; i++) {
        const p = tilePos(i, n), age = t - (addT[i] || 0);
        const s = age < 0.25 ? ease.back(clamp(age / 0.25, 0, 1)) : 1;
        drawTile(c, kind, p.x + shakeX, p.y, tileS, L.letters[word[i]], s, s);
      }
    } else if (!won) {
      const fs = Math.round(Math.max(20, tileS * 0.36));
      c.font = `600 ${fs}px ${U}`;
      const msg = `${found.size} of ${L.words.length} words found`, mw = c.measureText(msg).width + fs * 1.6;
      glass(c, WH.x - mw / 2, tilesY - fs * 0.95, mw, fs * 1.9, fs * 0.95, { tint: 'rgba(40,10,70,0.35)' });
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillText(msg, WH.x, tilesY + 1);
    }

    // The wheel
    const R = WH.r;
    c.drawImage(wheelImg.cv, WH.x - wheelImg.s / 2, WH.y - wheelImg.s / 2, wheelImg.s, wheelImg.s);
    // the glowing line through the chosen letters
    if (n) {
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      word.forEach((li, i) => { const p = letterPos(li); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); });
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = 'rgba(255,150,60,0.28)'; c.lineWidth = WH.lr * 0.9; c.stroke();
      c.strokeStyle = 'rgba(255,190,90,0.5)'; c.lineWidth = WH.lr * 0.5; c.stroke();
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = '#ffb347'; c.lineWidth = WH.lr * 0.26; c.stroke();
      c.strokeStyle = 'rgba(255,255,230,0.9)'; c.lineWidth = WH.lr * 0.08; c.stroke();
      c.restore();
    }
    const n2 = L.letters.length;
    for (let li = 0; li < n2; li++) {
      const p = letterPos(li), used = word.indexOf(li);
      let s = 1 + Math.sin(time * 2 + li) * 0.02; // breathing
      if (used >= 0) { const age = t - (addT[used] || 0); if (age < 0.3) s *= 1 + Math.sin((age / 0.3) * Math.PI) * 0.18; }
      const b = ballSprite(used >= 0 ? 'gold' : 'pearl', WH.lr), d = b.size * s;
      c.drawImage(b.cv, p.x - d / 2, p.y - d / 2, d, d);
      c.font = `700 ${Math.round(WH.lr * 1.15 * s)}px ${F}`;
      if (used >= 0) { c.lineWidth = WH.lr * 0.12; c.strokeStyle = 'rgba(140,50,0,0.7)'; c.strokeText(L.letters[li], p.x, p.y + WH.lr * 0.06); }
      c.fillStyle = used >= 0 ? '#fff' : '#3b1d6e';
      c.fillText(L.letters[li], p.x, p.y + WH.lr * 0.06);
    }
    // The remote's focus: a glowing, turning ring on a letter.
    const showFocus = !won && !Kit.touchFirst();
    if (showFocus && focus < n2 && !spin) {
      const p = slotPos(focus), pr = WH.lr * 1.14 + Math.sin(time * 6) * 2;
      c.save(); c.globalCompositeOperation = 'lighter';
      c.beginPath(); c.arc(p.x, p.y, pr + 5, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,220,90,0.35)'; c.lineWidth = 12; c.stroke();
      c.globalCompositeOperation = 'source-over';
      c.beginPath(); c.arc(p.x, p.y, pr, 0, Math.PI * 2); c.strokeStyle = '#ffe066'; c.lineWidth = 4; c.stroke();
      c.lineWidth = 5; c.strokeStyle = '#fff';
      for (let k = 0; k < 3; k++) { const a = time * 2.5 + (k * Math.PI * 2) / 3; c.beginPath(); c.arc(p.x, p.y, pr, a, a + 0.5); c.stroke(); }
      c.restore();
    }

    // Letters on their way into the grid (or to the coins)
    for (const f of flying) {
      const k = clamp((t - f.t0) / f.dur, 0, 1);
      if (t < f.t0) { drawTile(c, 'word', f.x0, f.y0, f.s0, f.ch); continue; }
      const e = ease.inOut(k);
      const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * H * 0.08;
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5;
      const gs = lerp(f.s0, f.s1, e) * 2.2; c.drawImage(glowDot, x - gs / 2, y - gs / 2, gs, gs); c.restore();
      drawTile(c, f.cell ? 'found' : 'again', x, y, lerp(f.s0, f.s1, e), f.ch);
    }

    // Buttons: glass pills with drawn icons
    buttons.forEach((b, i) => {
      const on = showFocus && focus === n2 + i;
      const off = (b.id === 'clear' && !n) || (b.id === 'hint' && coins < HINT_COST);
      glass(c, b.x, b.y, b.w, b.h, b.h / 2, { tint: on ? 'rgba(255,190,60,0.55)' : 'rgba(60,20,90,0.4)', edge: on ? '#fff3c0' : 'rgba(255,255,255,0.3)', focus: on, t: time });
      const label = b.id === 'shuffle' ? 'Shuffle' : b.id === 'hint' ? 'Hint' : 'Clear';
      const fs = Math.round(Math.min(b.h * 0.4, b.w * 0.15));
      c.font = `700 ${fs}px ${U}`;
      const col = off ? 'rgba(255,255,255,0.4)' : on ? '#3a1800' : '#fff';
      const extra = b.id === 'hint' ? fs * 1.9 : 0;
      const tw = c.measureText(label).width, total = fs * 1.3 + tw + extra;
      const x0 = b.x + b.w / 2 - total / 2, cy = b.y + b.h / 2;
      icon(c, b.id, x0 + fs * 0.5, cy, fs * 1.05, b.id === 'hint' && !off && !on ? '#ffe066' : col);
      c.fillStyle = col; c.textAlign = 'left'; c.fillText(label, x0 + fs * 1.3, cy + 1);
      if (extra) {
        const cn = coinSprite(fs * 0.42); c.drawImage(cn.cv, x0 + fs * 1.45 + tw, cy - cn.size / 2, cn.size, cn.size);
        c.font = `700 ${Math.round(fs * 0.8)}px ${F}`; c.fillText(String(HINT_COST), x0 + fs * 2.45 + tw, cy + 1);
      }
      c.textAlign = 'center';
    });

    // Fireflies
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const x = ((m.x + time * 0.01 * m.s) % 1) * W + Math.sin(time * 0.7 + m.p) * 20;
      const y = m.y * H + Math.cos(time * 0.5 + m.p) * 16, a = 0.35 + 0.35 * Math.sin(time * 2 + m.p * 3), s = 10 + m.s * 16;
      c.globalAlpha = Math.max(0, a); c.drawImage(glowDot, x - s / 2, y - s / 2, s, s);
    }
    // star sparkles
    for (const p of sparks) {
      const k = 1 - p.life / p.max;
      c.globalAlpha = k; c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      starPath(c, 0, 0, p.s * k + 2, (p.s * k + 2) * 0.38); c.fillStyle = p.color; c.fill();
      c.restore();
    }
    c.restore();

    // How to play
    const hs = Math.round(Math.max(18, Math.min(H * 0.03, 24)));
    c.font = `600 ${hs}px ${U}`;
    const tip = Kit.touchFirst() ? 'Swipe or tap letters · tap the word to enter it'
      : focus >= n2 ? '◀ ▶ move · OK press · ▲ back to the letters · Back exits'
        : '◀ ▶ choose a letter · OK add · ▼ enter word · ▲ remove letter · Back exits';
    let tw = c.measureText(tip).width;
    if (tw > W * 0.9) { c.font = `600 ${Math.floor(hs * (W * 0.9) / tw)}px ${U}`; tw = W * 0.9; }
    glass(c, W / 2 - tw / 2 - hs, H - hs * 2.3, tw + hs * 2, hs * 1.8, hs * 0.9, { tint: 'rgba(20,10,40,0.45)' });
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillText(tip, W / 2, H - hs * 1.4 + 1);

    const mb = muteBox();
    c.font = `${Math.round(mb.h * 0.55)}px ${U}`;
    c.globalAlpha = 0.8; c.fillStyle = '#fff';
    c.fillText(Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2);
    c.globalAlpha = 1;

    // Level intro banner
    if (introT < 1.8 && !won) {
      const a = introT < 0.35 ? ease.back(introT / 0.35) : introT > 1.4 ? 1 - (introT - 1.4) / 0.4 : 1;
      c.save(); c.globalAlpha = clamp(a, 0, 1); c.translate(W / 2, H * 0.45); c.scale(clamp(a, 0, 1.2), clamp(a, 0, 1.2));
      ribbon(c, 0, 0, Math.min(W * 0.5, 460), Math.min(H * 0.13, 90), `Level ${level}`, Math.round(Math.min(H * 0.075, 54)));
      c.restore();
    } else if (introT < 7 && level <= 2 && found.size === 0 && !n) {
      c.globalAlpha = Math.min(1, (introT - 1.8) * 2, (7 - introT) * 2);
      c.font = `700 ${Math.round(Math.max(20, Math.min(H * 0.034, 26)))}px ${U}`;
      c.fillStyle = '#fff59d';
      c.fillText('Make words from the wheel to fill the grid!', titleX, board.fy + board.bh + H * 0.035);
      c.globalAlpha = 1;
    }

    if (won && t - wonT > 0.6) drawWin(c, W, H, t, time);
  }

  function drawWin(c, W, H, t, time) {
    const a = clamp((t - wonT - 0.6) / 0.4, 0, 1);
    c.fillStyle = `rgba(20,4,30,${0.6 * a})`; c.fillRect(0, 0, W, H);
    c.save(); c.translate(W / 2, H / 2);
    // glow burst behind the panel
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 * a; c.rotate(time * 0.2);
    const rs = Math.min(W, H) * 0.9; c.drawImage(rays.cv, -rs, -rs, rs * 2, rs * 2); c.restore();
    const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.84, 580), ph = Math.min(H * 0.6, 360);
    const pg = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
    pg.addColorStop(0, '#6a2a96'); pg.addColorStop(1, '#2a0c48');
    roundRect(c, -pw / 2, -ph / 2, pw, ph, 30); c.fillStyle = pg; c.fill();
    glass(c, -pw / 2, -ph / 2, pw, ph, 30, { tint: 'rgba(160,80,200,0.2)', edge: 'rgba(255,220,140,0.85)' });
    ribbon(c, 0, -ph / 2 + 4, pw * 0.78, Math.min(80, ph * 0.22), 'Level complete!', Math.round(Math.min(ph * 0.13, 44)));
    let hintsUsed = 0;
    for (const cell of L.cells.values()) if (cell.hint) hintsUsed++;
    const stars = hintsUsed === 0 ? 3 : hintsUsed <= 2 ? 2 : 1;
    for (let i = 0; i < 3; i++) {
      const st = clamp((t - wonT - 1.0 - i * 0.25) / 0.35, 0, 1), sk = st > 0 ? ease.back(st) : 0;
      const sx = (i - 1) * ph * 0.27, sy = -ph * 0.1 - (i === 1 ? ph * 0.05 : 0), R = ph * (i === 1 ? 0.13 : 0.11);
      c.save(); c.translate(sx, sy); c.scale(Math.max(0.001, sk), Math.max(0.001, sk));
      starPath(c, 0, R * 0.08, R, R * 0.48); c.fillStyle = 'rgba(40,0,40,0.5)'; c.fill();
      starPath(c, 0, 0, R, R * 0.48);
      if (i < stars) {
        const g = c.createLinearGradient(0, -R, 0, R); g.addColorStop(0, '#fff6b0'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#e08a00');
        c.fillStyle = g; c.fill(); c.lineWidth = 3; c.strokeStyle = '#fff3c0'; c.stroke();
      } else { c.fillStyle = 'rgba(255,255,255,0.15)'; c.fill(); }
      c.restore();
    }
    c.font = `700 ${Math.round(ph * 0.075)}px ${F}`; c.fillStyle = '#ffe08a';
    const cn = coinSprite(ph * 0.04);
    c.fillText(`+${LEVEL_COINS}`, ph * 0.04, ph * 0.13);
    c.drawImage(cn.cv, -ph * 0.11 - cn.size / 2, ph * 0.13 - cn.size / 2, cn.size, cn.size);
    c.font = `600 ${Math.round(ph * 0.062)}px ${U}`; c.fillStyle = 'rgba(255,255,255,0.88)';
    c.fillText(`Bonus words found: ${bonusFound.size} of ${L.bonus.size}`, 0, ph * 0.24);
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
  if (level > 1) Kit.record('wordwheel', level - 1);
})();
