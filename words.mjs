// Letter Pantry — embedded validation dictionary (original curation, offline).
// Common English words of 3–7 letters, lowercase, space-separated for compactness.
// Targets/bonus lists for every stage are derived from this list, so any word a
// stage can ask for is guaranteed present here.

const WORDS_A = `
able acid acre aged aide airy alarm album alert algae alien align alike alive alley allow
alloy alone aloud alpha altar alter amber amend ample amuse angel anger angle angry ankle
annex antic anvil apron arbor arena argue arise armor aroma array arrow ashen aside asset
atlas attic audio audit avail avert awake award aware awful bacon badge bagel baker basic
basil basin basis batch bathe beach beard beast begin beige bench berry birth black blade
blame blank blast blaze bleak blend bless blind blink bliss block bloom blunt blush board
boast bonus boost booth bound brain brand brave bread break breed brick bride brief bring
brink brisk broad broke brook broom broth brown brush buddy build bunny burst cabin cable
candy canoe carry carve catch cause cease cedar chain chair chalk champ chant chaos charm
chart chase cheap check cheer chess chest chief child chill choir choose chunk churn cider
cigar cinch circa civic civil claim clamp clash clasp class clean clear clerk click cliff
climb cloak clock clone close cloth cloud clover coach coast cocoa colon color comet comic
coral couch cough count court cover cower crack craft crane crash crate crave crawl craze
crazy cream crest crime crisp croak crock crown crude crumb crush crust cubic curry curve
cycle dairy dance debut decay decor delay delta demon dense depth derby deter diary digit
diner dirty ditch dizzy dodge donor doubt dough dozen draft drain drake drama drank drape
drawn dream dress drift drill drink drive drone droop drop drum dusty dwell eager eagle
early earth easel eaten ebony edge eight elbow elder elect elite email ember empty enact
enemy enjoy enter entry epoch equal equip erase error essay ether evade event every exact
exalt excel exert exile exist extra fable facet faint fairy faith fancy fatal fault favor
feast fence ferry fever fiber field fiery fight final finch first flame flank flash flask
fleet flesh fling float flock floor flour fluff fluid flush focus foggy folio force forge
forty forum found frame frank fraud fresh friar fried frock front frost froth fruit fudge
fungi funny gauge gaunt ghost giant given glaze gleam glide globe gloom glory glove grace
grade grain grand grant grape graph grasp grass grave gravy graze great greed green greet
grief grill grind groan groom groove grope gross group grove guard guess guest guide guild
guilt habit handy happy hardy harsh haste hatch haunt haven heart heavy hedge hefty hello
hence herb hinge hoard hobby hoist honey honor horse hotel house hover human humid humor
hurry ideal image imply inbox index inner input irony issue ivory jelly jewel joint judge
juice jumbo knelt knife knock known label labor laden lance large laser latch later laugh
layer learn lease least leave legal lemon level light lilac limit linen liner liver lobby
local lodge logic loose lorry lover lower loyal lucky lunar lunch lymph magic major maker
mango manor maple march marry match maybe mayor meant medal media melon mercy merge merit
merry metal meter midst might mimic minor minus mirth miser model modem moist money month
moral motor motto mound mount mourn mouse mouth movie muddy mural music naive nasty naval
needy nerve never newly night noble noise north noted novel nurse nylon oasis occur ocean
oddly offer often olive onion onset opera orbit order other otter ought ounce outer owner
oxide oyster paint panel panic paper party pasta paste patch patio pause peace peach pearl
pedal penny peril petty phase phone photo piano piece pilot pinch pine pitch pivot place
plaid plain plane plank plant plate plaza plead pluck plumb plume plural point polar porch
pouch pound power press price pride prime print prior prize probe prone proof proud prove
prune pulse punch pupil purse quail quart queen query quest queue quick quiet quilt quite
quota quote radar radio raise rally ranch range rapid ratio reach react ready realm rebel
refer reign relax relay relic remit renew repay reply rerun resin retro rider ridge rifle
right rigid ripen risen risk rival river roast robin rocky rogue room roost rough round
route royal rural sadly saint salad salsa salty sandy satin sauce scale scalp scare scarf
scene scent scoop scope score scout scrap screw scrub sedan seize sense sepia serve seven
shade shady shaft shake shale shame shape share shark sharp shave shear sheet shelf shell
shift shine shiny shirt shock shore short shout shown shrub shyly siege sigh sight silly
since singe siren sixth sixty skate skier skill skirt skull slant slate slave sleek sleep
slice slide slime sling slope slump small smart smash smell smile smoke snack snail snake
snare sneak snowy sober solar solid solve sonic sorry sound south space spare spark speak
spear speed spell spend spice spicy spill spine spire split spoil spoke spoon sport spout
spray stack staff stage stain stair stake stale stamp stand stare stark start stash state
stave stead steak steal steam steel steep steer stern stick stiff still sting stock stone
stood stool store storm story stout stove strap straw stray strip stuck study stuff stump
style sugar suite sunny super surge swan swap swarm swear sweep sweet swell swift swim
swing sword syrup table tacky taken tally tamper tangy taper taste tasty taunt teach teary
tease tempo tend tenor terse thank theft their theme there thick thief thigh thing think
third thorn those three threw throw thumb tiger tight timer tinge tired title toast today
token tonic topic torch total touch tough towel tower trace track trade trail train trait
tramp tread treat trend trial tribe trick troop trout truck truly trunk trust truth tulip
tumor tune twist uncle under union unite unity until upper upset urban usage usher usual
utter vague valid value valve vapor vault venue verse video vigor vinyl violin virtue visit
vital vivid vocal vodka voice voter wager waist wake waltz waste watch water weave wedge
weigh weird whale wheat wheel where which while whine white whole whose widen wider widow
width windy witch woman world worry worse worth would wound woven wreck wrist write wrong
yacht yearn yeast yield young youth zebra zest
`;

const WORDS_B = `
ace act add age ago aid ail aim air ale all amp and ant ape apt arc are ark arm art ash ask
ate awe axe bad bag ban bar bat bay bed bee beg bet bid big bin bit boa bog boo bop bow box
boy bud bug bun bus but buy cab cam can cap car cat cod cog con cop cot cow coy cry cub cue
cup cut dab dam day den dew did die dig dim din dip doe dog dot dry dub dud due dug duo dye
ear eat ebb eel egg ego elf elk elm end era erg err eve eye fad fan far fat fed fee fen few
fig fin fir fit fix fly foe fog for fox fry fun fur gab gag gal gap gas gem get gig gin gnu
gob got gum gun gut guy gym ham has hat hay hem hen her hex hey hid him hip his hit hoe hog
hop hot how hub hue hug hum hut ice ill imp ink inn ion ire irk ivy jam jar jaw jay jet jig
job jog jot joy jug jut keg ken key kin kit lab lad lag lap law lax lay lea leg let lid lie
lip lit log lop lot low lug mad man map mar mat may men met mid mix mob mom mop mop mud mug
nap net new nib nil nip nod nor not now nub nut oak oar oat odd ode off oil old one orb ore
our out owl own pad pal pan par pat paw pea pee peg pen pep per pet pew pie pig pin pit ply
pod pop pot pro pry pub pug pun pup put rag ram ran rap rat raw ray red rib rid rig rim rip
rob rod roe rot row rub rue rug rum run rut rye sad sag sap sat saw say sea see set sew she
shy sin sip sir sis sit six ski sky sly sob sod son sop sow soy spa spy sty sub sue sum sun
tab tad tag tan tap tar tau tax tea tee ten the thy tic tie tin tip toe tom ton too top tot
tow toy try tub tug tun two urn use van vat vet vex via vie vim vow wan war was wax way web
wed wee wet who why wig win wit woe wok won woo wow yak yam yap yaw yea yen yes yet yew yin
you zip zoo
`;

const WORDS_C = `
abate abide abort about above abuse actor acute adapt admit adopt adore adorn adult after
again agent agile agree ahead aisle ajar alarm alike alley aloud amend among amuse angel
anise ankle apart apple apply arena argon aside attic avoid await baker balmy banjo barge
basic baton bayou belch belly below berth beset birch bland blimp boggy bolus borax bough
brake brine broil brood burly burro buyer cairn camel cameo canoe caper cargo caste cater
caulk cello chafe chard chase chasm cheep chili chirp choke chord chore churn clamp cleat
clink clump cobra cocoa comer conch condo copse cramp creed creek creep crepe crept crest
cried croft crone crony cruet cumin curio curly daisy debit debug decry deity diary diced
dimly diner dingy diode dodge dogma doing donut dowel dozen drain drape dress dried drier
drily droid dryad dryer ducat duchy dummy dusky dwarf edict eerie eight elate elegy elide
elope elude embed emend emery ensue epoxy equip erode erupt essay ethos evict evoke exact
exude fable faker farce feign feint felon femur feral fetch fiber filet filly filth final
finer fjord flair flake flare flick flier flint flirt flour flout foist folly foray forte
forth foyer frail freak freed fries frisk froze gamer gaunt gavel gecko genie genre giddy
girth gismo gizmo gland glare glass glean glide glint gloat gnome gofer gorge gourd graft
grail grate graze grebe grime grisly grits groin grout grove growl gruel guano guava guild
gully gusto gypsy habit haste hasty havoc hazel heard heath heave helix herb hexes hilly
hinge hippo hitch hoard hobnob holler homely hone horde horny hose hound hover howdy humid
hunky hutch hyena icily icing ideal idiom idler igloo impel inane inept inert infer ingot
inlet inter irony islet itchy ivory jaunt jerky jetty jinx joist joker jolly joust juicy
julep junta juror kaput kayak kebab ketch kiosk kitty knack knave knead knell koala label
laden ladle lager lance lapel larch lasso latch lathe laud leafy leaky leapt lease leash
ledge leech lemur letup liar libel lichen liege lilac limbo limp lingo liter lithe llama
loamy locus loony loot lorry louse lousy lucid lumpy lunge lurch lurid lusty lyre macho
madam mambo mamma mangy mania manly manor maple marinade mash mate mauve maxim melee mesa
messy metal metro micro midge milky mimic mince miner minty miser misty mixer moat modal
mogul molar moldy money monik moose moped morph motel motif mould mousy mucus muddy muffin
mulch mummy mushy musky musty naive nanny nasal natal navel needy neigh newel niche niece
nifty ninja ninth nomad notch nouns nudge nymph oaken oases oblong odour ogle olive omega
onset oomph opine optic orbit organ otter ounce oust outdo oval ovary overt oxide ozone
paddy pagan paler panda pansy papal parse pasta pasty patchy patio patty pavvy peachy pecan
pedal peppy perch peril pesky pesto petal petty phlox phony piano picky piecing piety piggy
pilot pinch pinot pinto pious piste plaid plait plied plod poesy poise polka polyp poppy
potty pouchy prank prawn preen prick primy privy probe prong proxy pry pubic pudgy puffy
pulpy punch punky puppy purge pussy putty quack quail qualm quash queer quell query quiche
quirk quota rabbi rabid racer radish rainy rajah ramen ramshackle randy rapid raspy rattle
raven rayon ream rebel recap recut reed reedy reef reek regal rehab relive remap renal
repay repel resin resit retry revel rhyme ridge rifle rigor rinse roach roomy roost roper
rosy rotor rouge rouse rowdy ruddy ruffle rugby rumba rummy rump rune runny rustic rusty
saber sable saggy saint sandy sassy satyr saute savor savvy scald scamp scoff scold scone
scorn scour scowl scrap scree scum sedan seedy seine sense sent serum setup sewed shabby
shack shank shard shave sheaf shear sheen sheik shelf shied shoal shoer shone shook shove
shrew shrug shuck shunt sided sidle sieve silky simper sinew singe sisal skein skew skiff
skimp slack slain slang sleek slick slimy slink sloop slosh sloth slug slurp smack smelt
smirk smite smock smug snafu snaky sneer snide sniff snipe snore snort snout soggy soppy
sough spank sparse spasm spawn spelt sperm spiel spiky splotch spore sprat sprig spry spud
spunk spurn spurt squad squat squid stag stalk stamp stash stead steed stein stoic stomp
stork strum strut stump suave suds suede sulky sumac surly swami swank swath sweat swelter
swirl swish swoop taffy taken talc talon tang tango tapir tarot tarry taunt tawny tepee
tepid terra testy thigh thyme tiara tidal tiller tilting timid tipsy tithe toad toasty toddy
toffee tonal tonga tooth torso totem toxin trail tramp trawl triad trice trill tripe trite
troll tromp trope trove truce trudge tuft tulle tunny tuple tutor tweak tweed twerp twice
twine twirl udder ulcer ultra umbra uncap uncle unfit unify unkempt unlit unmet unrest unruly
unsaid untie unveil unwary upend uproar urban urine utensil vague valet valid valor vapid
veal vegan venom verge verve vicar vigil villa vinyl viper vogue voila vomit vouch vowel
wacky wafer waft wage wagon waif waive waltz wand wasp watchy waxen wean weave weedy weepy
welch welsh whack wharf whelp whiff whiny whirl whisk whist widow wield wince winch windy
wiry wispy wistful withe woken wooer woozy wordy wrest wright wring yacht yappy yearn yodel
yoga yogi yokel yucca yummy zany zeal zesty zilch zinc
`;

const WORDS_D = `
absorb absurd accent accept access accuse acorn across action actor actual adjust admire
adopt advent advice advise aerial affirm afford afraid agenda agree airflow airway albedo
albino alcove alder allege almond almost alpaca alpines amount amulet anchor angled animal
aniseed anneal annual anoint answer anthem antler anvil anyone appeal appear append apple
apricot apropos arcade archer ardent arnica around arouse arrest arrive artery artful ascend
asleep aspect aspire assault assert assess assign assist assume assure astern astral athome
attain attend attest auburn august auntie author autumn aviary awake awoken azalea backed
baker bakery baking ballad ballot bamboo banana banner banter barely barium barley barrel
barren bask basket bather batten batter battle bauble bazaar beacon beagle bearer beat
beauty beaver become bedlam beetle before behalf behave behind belief bellow belong bemoan
bender benign bequest berate berry beside bestir better bevel beware beyond bicycle bidder
bigger billow biscuit bitter blanch blazer bleach blend blinker blister blizzard blob blossom
blotch blubber blunder bobbin boil bolder bonnet bonbon border boreal borrow bottle boulder
bounce bounty bovine bowler brazen breach breeze briar bridle bright brimful broach broil
broker bronze brooch bruise brunch bubble bucket buckle budget buffalo buggy bulge bulk
bullet bumper bundle bunker burden bureau burger burlap burrow buster butter button bygone
cabana cabbage cabinet cable cackle cadet cajole calcite calorie camber cambric camera camp
canary candid candle canine cannery cannot canola canopy canteen canvas capable caper capital
capsule captain caption caramel carbon career caress caribou caring carnet carpet carrot cart
carton cartwheel cascade cash cashew casino casket castor casual catchy catnap cattle caudal
causal cavern cease celery cellar cement cereal certain chaff chain chair chaise chalk
chamber chance change chapel chapter charge chariot charm chart chasm chatter cheese cheesy
cherry cherub chest chew chicken chicory chilly chimera choice chooser chorus chrome chunky
cinder cinema cipher circle circus citric citrus claret clarify classic clause cleanly cleave
clemency clergy clever climate clinch clink clipper closet clover clutch coal coarse coast
coat cobalt cobbler cocoa coconut coddle coffee cognac cohere cohort collide column combat
combine comedy comet comfort commend comment commit common compel compile comply comport
compote concert concoct concord condor confab confide confirm conform confuse congeal conical
consent consul consult consume contact contain content contest context control convert convey
cookie cooler copper coral cordial cork corner cornet corona correct costume cottage cotton
cougar counsel county couple courage course cousin covet coyote cradle craft crater crayon
creak crease create credit cricket crimson crisp crockery crochet crouch crouton crucial
cruise crumble crunchy crutch crystal cuckoo cuddle culinary cumber cupboard curator curdle
curfew currant current curtain curtsy cushion custom cutler cyclone dabble dainty dairy
daisy damper dancer dandle dapper daring darken dart dashed dazzle deacon dealer debate
decade decent decide declare decline decoder decry deduct deface defeat defect defend defer
defile define deflect deform defraud defrost degree delay delete deltoid deluge demand demure
denial denote denser depart deploy deposit derail derive descent design desire detach detail
detect detour device devise devote devour diaper dice differ digest dignify dilute dimmer
dimple dinner dipper direct disarm discern dispel display dispose dispute distant distill
dither diurnal diverse divide divine docile doctor dodder dollar dolphin domain donate doodle
dormant dossier double dowel downy draft dragon drawer dreamy dredge drench dribble drizzle
droll druid dryer dubious duffel dugout dulcet dumbbell during dustpan duster dwindle earn
earnest earth earthen easier easter eatery ecru eddy edible edict eerie effort eggnog egress
either elastic elated eldest elegant element elevate elfin elk elm embark ember emblem embrace
emerald emit empathy employ enable enamel enameled encamp encore endear endive endorse endure
energy engage engine engorge engrave enhance enigma enlist enliven enough enrich enroll ensure
entail enthrall entire entitle entomb entrap entrust entry envelop enviable enzyme equator
ermine errand escape escort essence estate esteem etching evade even evening evict evince
exact exalt exam exceed excise excite excuse exempt exhale exhume exile expand expect expel
expert expire explain explode explore export expose extant extend extent extinct extract eyelet
fabric facile factor fade fagot failure fainter fairly falcon fallow famine famish fancy
farmer fashion fasten father fathom fatigue faucet fault fauna fear feast feather feature
feeble feline fellow felt fence fender fern fervor fester feud fever fiddle fidget fierce
figure fillet filler filter finale finder finger finite fiscal fisher fissure fixture flaky
flame flange flash flavor fleece flicker flight flimsy flinch flint float floral florid floss
flourish fluent fluffy flurry foible folder fondle fondue forage forbid forest forget forgive
formal former fortify fortune fossil foster foul foundry foxy fragile frantic freezer frenzy
fresco frigid fringe frolic frontier frosty frozen frugal fumble funnel furrow fury fusion
gadget gain gala gallant gallery gallon gallop gambol gamut garden garlic garnish gather
gauge gazer geisha gender gentle gentry geode gerbil ginger gingham giraffe glade glamor
glance glaze glisten glitter glorify glossary gnarled gobble goblet golden gondola gopher
gossip govern grab gradual grammar granular granary granite granted graphite gravity greasy
griddle grimace grip grocer grotto grouse grower grudge grumble grunt guava guide guile gulf
gullet gumboil gunner gurgle gusher gust gutter habit hail haircut hallway halter hamlet
hammer hamper handel handle hangar hanker happen harbor harden harmony harness harp harsh
harvest hassle hasten haughty hazard hazy hearth heater hectic hedgerow heifer helium helmet
helper herald herbal herd heron hidden hilarity hinder hinge history hoard hockey holder
hollow homage honest hoodie hoof hookah hopeful horizon horrid hostage hostel hotpot hour
hovel however hubbub huddle humble humerus hunger hunter hurdle hurl hurry hurt hustle hybrid
icicle idea idiom idle igloo ignite ignore image imbue immense immune impair impart impel
imply import impose impress improve impulse incant incense inch incite income indeed indent
indigo induce inept infant infect infest inflict influx inform ingest inhale inherit initial
injure inland inn inner inquest insect insert inside insist inspire install instep insulin
insult intact intake intend intent intern intone intrude invade invent invest invite invoke
inward ire irk irony island issue itch item itself jab jacket jaguar jargon jaunt jaw jazz
jealous jelly jest jet jewel jingle jockey jolly jostle journal journey jovial judge jug
juggle juice jumble jumper jungle junior junk juror justice jut kale karma kayak kernel
kettle khaki kidnap kidney kiln kindle kindly king kinship kitchen kitten knapsack kneel
knit knob knoll kosher label labor lacquer ladder lagoon lair lament lamp lantern lard
lark lasagna lasso lasting latch latent lather latitude laud laugh launch laurel lavish
lawful layer lazy leader league leash leaven ledger legacy legend legion legume leisure
lender length lentil lesson letter lettuce level lever liable liberal liberty library lichen
lilac lily limber limit limpid linear linger liquid listen litany litter little lively liver
livid llama loach loan loath lobster locale locate locker locket lodge lofty logic loiter
lonely longing loon loosen lord lotion lottery loud lounge lovely loyal lucid lumber lump
lunar lung luster luxury magic magnet magnify magpie maiden mainly maize major mallet mallow
mammal manage mandate manner manor mansion mantle marble margin marina marine market maroon
marry marsh martial mascot mask mason master match matinee matrix matter mature meadow
meager meal meant measure meat medal meddle medium melody melt member memory menace mental
mentor mercy merely merger meteor method metro middle midge midriff mildew mile milk mill
mimic mince mind mine mingle mini minor mint minute mirage mirror miser missile mission
misty miter mix moan mobile modern modest modify module moist molar mold molten moment
monarch monkey monster monthly monument mood moose moral morale morbid mortar mosaic moss
motel mother motion motive motor motto mound mountain mouse mousse mouth movement mow mud
muddle muffin mug mulberry mullet mumble mural muscle museum mush music mustard mutter mutual
muzzle myriad nab nail naive napkin narrate narrow nasal nation native nature nautical near
neat nectar needle neglect neighbor neither nerve nest nettle neutral never nice niche nickel
niece nightly nimble noble nod noise noodle noon normal north nose notch note notice notion
noun novel nozzle nuance nudge number nurse nurture nutmeg nylon oar oasis oats obey object
oblige oblong obtain occasion occupy occur ocean octave odd odor offer office offset ogle
oil okay olive omelet omit once onion onward opal open opera opinion oppose optic option
oracle oral orange orbit orchid ordain order organ orient origin ornate ostrich other otter
ounce outcome outdoor outfit outlaw output outrage outside outward oval oven over owl own
oxide oyster pack pact paddle pagan page pain paint pair palace pale pallet palm pan panel
panic panorama pansy pantry paper parch pardon parent parish park parlor parrot parsley
partial partner party pass pasta pastel pastor pasture patch path patio patrol pattern pause
paw pay peace peach peak peanut pear pebble pecan pedal peer pen pencil pension people
pepper perch peril person pest pestle petal petty phone photo phrase piano pick picnic pie
piece pier pig pigeon pile pillow pilot pinch pine pink pint pioneer pipe pit pitch pity
pivot pizza place plaid plain plan plane planet plank plant plate play plaza plea pleasant
please pleat plenty plight plot ploy pluck plug plum plumb plume plunge plural pocket pod
poem poet point polar pole policy polish polite pond pony poplar poppy porch pore port pose
posh possess post pot potato potion potter pouch pounce pound pour pout powder praise prance
pray preach precise prefer premise press pretty price pride priest primal prime print prism
prison private prize probe problem prod profit prompt prone proof proper prose proud prove
prune pry public puddle pulley pulp pulse pump punch punish pupil puppet pure purge purple
purpose purse pursue push put putt puzzle quaint quake quality qualm quarrel quart quarter
quartz queen quench query quest queue quiche quick quiet quill quilt quit quite quiver quiz
quota quote rabbit raccoon race rack radar radio raft rage raid rail rain raise rake rally
ranch random range rank rapid rare rascal rash rasp rat rate rather ratio rattle raven raw
ray reach react read ready realm reap rear reason rebel rebuke recall recede recent recess
recipe recite reckon record recount recover redeem reduce reed reef reel refer refine reflect
reform refrain refresh refuge refuse regal regard regime region regret reign rein reject
relate relax relay relic relief relish rely remain remark remedy remind remit remote remove
render renew rent repair repeat repel reply report rescue resent reserve reside resign resist
resort respect rest result resume retain retire retort return reveal revenge revenue review
revise revive revolt reward rhyme rhythm ribbon rice rich ride ridge right rigid rim ring
rinse riot ripe ripple rise risk ritual rival river roach road roam roast robe robin robust
rock rocket rod rogue roll roof room roost root rope rose rosy rot rotary rotor rough round
rouse route routine rover row royal rub ruby rudder rude rug ruin rule rumble rumor run rung
rural rush rust rustic rut sacred sad saddle safe saga sage sail saint salad sale salmon
salt salute sample sand sane sap sash satin satire sauce saunter save savor say scale scalp
scan scant scar scare scarf scene scent scheme scholar school scold scoop scope score scorn
scout scrap scratch scrawl scream screen screw script scroll scrub sculpt sea seal seam
search season seat secede second secret sect secure seed seek seem seep seize seldom select
self sell send sense sentence sequel seraph series serve set settle seven severe sew shabby
shade shadow shaft shake shall shallow shame shape share sharp shave sheaf shear shed sheer
sheet shelf shell shelter shepherd shield shift shine ship shirt shock shoe shoot shop shore
short shout shove show shred shrewd shrink shrub shrug shuffle shut shy sick side siege sift
sigh sight sign silence silk sill silly silver simple sing single sink sip sir sister sit
site six size skate sketch ski skill skin skirt skull sky slab slam slap slate slave sled
sleek sleep sleet slender slice slick slide slight slim sling slink slip slit slogan slope
slot slow slumber small smart smash smear smell smile smirk smoke smooth snack snail snap
snarl sneak sneer sneeze snore snout snow snug soak soap soar sob sober social sock soda
sofa soft soil solar sole solid solve sonar sonnet soon soot sorrow sort soul sound soup
sour source south space spade span spare spark sparse speak spear speech speed spell spend
spice spill spin spine spirit splash split spoil spoke sponge spoon sport spot spouse sprain
sprawl spray spread spring sprout spur spy square squat squeeze squid stable stack staff
stage stain stair stake stale stalk stamp stand staple star starch stare start startle stash
state statue status stay steady steak steal steam steel steep steer stem step stern stew
stick stiff still sting stir stitch stock stomach stone stool stop store storm story stove
strain strand strap straw stray streak stream street stress stretch stride strike string
strip stripe strive stroke stroll strong struggle stub stuck student studio study stuff stump
stun sturdy style subdue submit subtle suburb succeed such sudden suds suffer sugar suggest
suit sulky sum summit sun sundae sunny super supper supply sure surf surge survey survive
suspect sustain swallow swamp swan swap swarm sway swear sweat sweep sweet swell swift swim
swing swirl switch sword syrup table tackle tail tale talk tall tally tame tan tang tank
tap tape taper tar target tart task taste taught taunt tax tea teach team tear tease ted
tell temper temple tempt ten tend tender tennis tense tent term terror test text thank thaw
theft theme then theory thick thief thigh thing think thirst thorn thread threat three
thrill thrive throat throw thrust thumb thunder thus tick ticket tide tidy tie tiger tight
tile till tilt timber time tin tinge tint tiny tire title toad toast today toe toil token
toll tomato tone tongs tonic tool tooth top torch torment torn torso toss total touch tough
tour tow toward towel tower town trace track trade trail train trait tramp trap travel tray
tread treat tree trek trend trial tribe trick trim trip triumph troop trot trouble trout
truck true trunk trust truth try tub tube tuck tuft tug tulip tumble tuna tune turf turn
turtle tutor tweak twice twig twin twine twirl twist type ugly ulcer uncle under undo unfit
unify union unit unite unity until unwind upon upper upset urban urge use usher usual utile
utter vacant vague vain valid valor value valve van vanilla vapor vary vast vault vegetable
veil vein velvet vendor vent verb verse very vest veto vice view vigor villa vine vinegar
vintage vinyl viola violet violin virtue visa visit visual vital vivid vocal voice void
volcano volume vote vouch vow wade wafer wag wage wagon waist wait waive wake walk wall
walnut wander want ward warm warn warp wash wasp waste watch water wave wax way weak wealth
wear weave web wedge weed week weep weigh weird welcome well west wet whale what wheat wheel
when where which while whim whine whip whirl whisk whisper whistle white whole wide widow
width wife wild will wilt win wince winch wind window wine wing wink winter wipe wire wise
wish wit witch with woe wolf woman wonder wood wool word work world worm worry worse worth
would wound wrap wreath wreck wrist write wrong yard yarn year yearn yeast yellow yield yoga
yoke yolk young youth zeal zest zone
`;

const WORDS_E = `
absolve abstain academy acclaim account accrue accustom acetate achieve acidic acolyte acoust
acquire actuate adamant adapter adjourn admiral adrenal advance adverse adviser aegir aerate
aerosol affable affront against agility ailment airline airport alabaster albumen alfalfa
aligned alkaline allegro allergy allspice almanac already alumna ambient amendable amid
amnesty ampere amphora amplify anaheim analogy analyst anathema ancient angina angler anguish
angular animate anise annals annoy annuals anomaly another antacid antenna anthology antibody
antic antipasto anxious anymore apparel applaud applied appoint approve aquaria aqueous
archaic archive armada armful armoire arsenal artisan ascetic ashamed ashtray aspirant
assuage athlete atlas atoll atrium attire attuned auction audible auditor augur aurora
austere autograph autumnal avenge average averse aviator avowed awesome awkward axiom babble
babysit bacilli backlog badger baggage bagpipe bailout balance balding baleen ballast balloon
balmoral balsam banish banister banjoist banker banquet baptize barb bargain barkeep bark
barnacle baronet baroque barrage barrister basalt bashful basinet bassoon bastion bathtub
batsman battery baud bayside beach bedeck bedside beefy beeline beeswax beggar begrudge
behave behavior behead behold belated belie believer bellhop beloved beneath benedict benefit
benignly benzene bequest beret berserk besides bestow betrayal beverage bewilder bicycle
bifocal bigotry bikinied bilk billiard billion bindery bingo biology bipedal birdcage
birdseed birthday bishop bitumen bizarre blacken bladder blandish blanket blaspheme blatant
bleach blemish blender blinded blissful blister blithe blizzard blockage blond bloodline
blotter bluebell blueprint bluff blunder bluntly blur blush boarded boaster bobbin bodice
bodywork bogus boilermaker bolster bombard bondage bonehead booklet bookmark booster bootleg
boredom borough bossy botanical botany bothersome bottleneck bottom bought bouncer boundary
bourbon bovine bowing boxcar boycott bracing bracket braggart braided brainy bramble brandy
brassiere bravado brawl brawny breadth breath breeder brewing bribery briefly brigade
brilliant brimstone briny brisket bristle broaden broiler broken bromide bronco brooder
brooklet brouhaha brownie browse brunette brunt brusque buckler bucolic budding budgetary
buffoon bulbous bulldog bullion bully bumble bungler buoyant burglar burial burnish bust
butler buttery buzzard byline cabaret cabbage cabinetry cache cadence cadmium caffeine
calamity calcium calendar caliber caloric calzone camellia campsite campus canal candidacy
candied cannoli canoeist cantata cantina capability capillary capsule captivate capture
caramel caravan cardamom cardiac cardigan careless cargo caribou carnival carousel carriage
cartilage cartoon cascade cashmere casserole catalog cataract catfish cathedra caulk causeway
caution cavalry caviar cedar celestial cellular centaur centered centrist ceramic cerebral
ceremony certainty chagrin chairman chalky challenge champagne champion chandler changeful
chanson chaotic chaplain charcoal charger charisma charitable charlatan chassis chasten
chatty cheddar cheerful chef chemical cherish chestnut chicle chiefly children chili chimera
chinchilla chipmunk chivalry chloride choice chowder chrome chronic chuckle churn cicada
cilantro cinder cinematic cinnamon circular citizen civil claimant clairvoyant clamor clarify
classical classify clean cleanser clearance clemency clerical climate clinical clipper cloister
closure clothing clover coalition coastline cobbler cobweb coconut coercive coexist coffee
cognac coherent cohesion coincide colander cola cold collate college collide colonel color
colossal column comedic comely cometary comfort command commerce common commuter compact
compare compass compel compile complex comport compose compound comprise compute comrade
concave conceal concede concept concern concert concise conclude concrete condone conduct
confess confide confine confirm conform confound confront confuse conical connect conquer
consent consider consign consist console consort consult consume contact contain contempt
content contest continue contour contract contrary contrast control convene convert convey
convict convince cookout coolant cooper copilot copper copy coracle cordial cordon cornmeal
corona coroner correct corridor corrupt corsage costume cotillion cottage cougar council
counsel counter country couple courage courier course courtly cousin coverage coyote cozy
cracker cradle cranial cranny crawler credible creditor creed cremate crescent crest crew
cricket crimson cripple criteria critical croissant crony croquet crucial cruelty cruiser
crumbly crumpet crunchy crusader crusty crystal cubicle culinary culvert cupboard cupful
curator cure curfew curious currant cursory curtsey curtail curtain cushion custody custom
cutlery cyclical cynical cypress dabbler daffodil dainty dairymaid daisy dandelion danger
dapper daring darken darling daytime dazzler deacon dealer dearly debacle debase debate
debris debut decadence decaf decanter decent decimal declare decline decorate decoy decrease
dedicate deduct default defector defender defense defer deficit definite deform degrade
deity delegate delete delicacy delicate delight deluge demeanor demise demure density dental
deny depend depict deplore deploy deport deprive deride derive descend describe desert
design desire desktop despair dessert destiny detach detail detect deter detour detract
develop deviant device devoid devote devout diagram dialect diaper dictate diesel dietary
diffuse digest digital dignity dilemma diligent dilute dimness dimple dinner diploma dirge
disable disarm disaster discard discern discord discover discrete discuss disdain disease
disguise disgust dishevel dishonor dislike dismal dismiss disorder dispatch dispense disperse
display dispute disrupt distance distill distort disturb ditch ditty diverge diverse divert
divide diviner divisor divorce docile dockyard doctrine document dogwood doldrums dolphin
domestic dominant donate donor doodle doorway dormant dosage doting double doubtful dour
dowager downpour draft dragoon drainage drama drastic dreadful dreamer dredger dresser
dribble drifter drilling driveway droll droplet drought drummer dubious duchess ductile
dudgeon duffel dungeon durable duration dusk dustbin duvet dwelling dynamic dynasty eager
earl earmark earnest earthy easel eastern eatable eccentric ecology economy ecstatic edge
edible edifice edition educate eerie efficacy effort egghead eggplant egress eight either
elastic elbow elder elderly elegant elegy element elephant elevate elite elm eloquent
elusive emanate embark embassy embed emblem embody embrace emerald eminent emit emotion
empathy emperor emphasis empire employ empower emulate enact enchant encore endeavor endorse
endure energetic enforce engage engine enhance enigma enjoy enlarge enlighten enlist enough
enrich enroll ensemble ensure enter enthuse entire entity entourage entrance entreat entry
envelop enviable envious envision envoy enzyme ephemera epic episode equal equate equator
equip equity erase ermine errand erratic error erupt escape escort esophagus essay essence
establish estate esteem estrange eternal ethical evade evaluate even evening event evict
evidence evoke evolve exact exalt examine example exceed excel except excess excite exclaim
exclude excuse execute exempt exercise exhale exhaust exhibit exile exist exit exotic expand
expect expel expense expert expire explain explode explore export expose express extend
extent extinct extract extreme eyebrow fabric facade facility factor faculty failure faint
fairway faithful falcon fallout falter familiar famine fanatic fancy farewell fashion fasten
fatal fathom fatigue faucet fault favorite fearful feasible feather feature federal feeble
feeling fellow felony fender feral ferment fertile fervor festive fetch fetus fever fiber
fiction fidelity field fierce figment figure filament filter final finance finder finger
finish finite firearm firefly firm fiscal fisher fissure fitness fixture flagrant flair
flaky flamingo flank flannel flash flatten flavor flawless fleece fleeting flexible flicker
flight flimsy flinch fling flipper float flock flood floor floral florist floss flourish
fluent fluffy fluid flurry flutter foam focal focus folder foliage follow fondle fondness
foolish footnote forage forbid force ford forecast foreign forest forever forfeit forge
forget forgive formal former formula fort fortune forum forward fossil foster foundry
fountain fraction fragile fragment fragrant frame frantic freak freckle freedom freezer
freight frenzy frequent fresco fresh friction friend frigate frigid frisky frolic frontal
frontier froth frown frozen frugal fruitful frustrate fuchsia fuel fulfill fumble function
fungus funnel furious furnace furrow further fury fusion future gadget gainful galaxy
gallant gallery galley gallon gallop galore gambit gamut gaping garb garden gardenia
gargoyle garland garlic garment garnish gasoline gateway gather gaudy gauntlet gazette
gecko gelato general generous genius gentle genuine geology gesture getaway geyser ghastly
ghetto ghostly giant giddy gift gigantic giggle ginger giraffe girder given glacier glamour
glance glaring gleeful glisten glitter global gloomy glorious glossy glower glucose goal
goblet goddess goldfish gondola gorgeous gorilla gospel gossip govern graceful gradient
graduate graffiti grain grammar grand grandeur granite granola granted graphite grappling
grateful gratify gravel gravity grazing grease greedy greeting grenade gridlock grievance
grill grimace grinder gripping grocery groom grotesque ground group grove growl growth
grudge grumble guardian guidance guilt guitar gulf gullible gurgle gust guttural gymnast
habitat haggard haircut halfway hallo hallmark hallow hallway halogen hamlet hammock hamper
handful handicap handle handsome hangar happen happy harbor harden hardship hardware hardy
harmful harmony harness harsh harvest hassle haste hatchet hateful haughty haunt hazard
hazel headband heading headline health hearing hearten hearty heater heather heaven heavy
hectic hedge heed height helium helmet helpful herald herbal heretic heritage hermit hero
hesitant hideous highland highway hillock hinder hipster history hoard hoarse hobby hockey
holdup holiday hollow holy homeward honest honey honor hopeful horizon hormone hornet horrid
horror hostage hostile hotel hourly houseful however hubbub huddle human humane humble
humid humility humor hunger hunter hurdle hurry husband hush hustle hybrid hydrant hygiene
hyphen icicle icon idea ideal idiom idle idol ignite ignore iguana illness image imagine
immense immerse immune impact impart imperial import impose impress improve impulse inability
incentive inch incisor include income increase indeed index indicate indigo indoor induce
indulge inept inertia infamous infant infect infer infinite inform infringe ingredient
inhabit inhale inherit initial inject injury inland inlet innate inner innocent input inquire
insect insert inside insight insist inspect inspire install instant instead insult intact
intake integer intend intense intent interim internal intrude invade invalid invent inverse
invest invite invoke involve inward iron irony island issue item ivory jacket jade jaguar
jargon jasmine jaunt jaw jazz jealous jelly jeopardy jerk jersey jest jewel jingle jobless
jocular join joint joke jolly jolt jostle journal journey jovial joyful judge jugular juice
jumble junction jungle junior juror justice justify kayak keel keen keep kennel kernel
ketchup kettle keyboard keyhole khaki kick kidney kiln kind kindle kindred king kiosk kiss
kitchen kite kitten knack knead knee kneel knife knight knit knob knock knowledge label
labor labyrinth lacquer ladder laden ladle lagoon lamb lament landing lantern lapel laptop
larder large lark laser lasso lasting latch latent lateral lather latitude lattice laugh
laughter launch laundry laurel lavish lawful layer layout lazy leaden leader leaflet league
learn lease leash leather lecture ledger legacy legal legend legible legion legume leisure
lemonade lender length lens lentil leopard lesson letter lettuce level lever liable liberal
liberty library license lichen liege life lighten lighthouse likeness lilac lily limb limber
limit limp line linear linen linger lingo link lion liquid list listen literal litter little
live livid lizard load loaf loan lobby lobster local locate lock lodge loft logic lonely
long look loose lord lose loss lotion lotus loud lounge love loyal lubricant lucid luck
luggage lumber lump lunar lunch lung lurch lure lurid lush luster luxury lyric magic magnet
magnify magnitude maiden mail main maintain maize major make maker malaise mall mammal
manage mandate mango manner manor mansion mantle manual maple marble march margin marina
mariner marital market marmot maroon marriage marrow marsh marshal martial marvel mascot
mask mass master match mate math matter mature maximum mayhem mayor meadow meager meal
mean measure meat medal media medium meet melody melt member memory menace mental mention
mentor menu mercy merge merit merry mesquite message metal meteor meter method metric
mettle middle midge midst mild mile milk mill mimic mind mine mineral mingle mini minimal
minimum minister minor mint minus minute miracle mirage mirror miser misery mission mist
mistake misty mite mix moan mobile mode model modem modest modify module moist molar mold
mole molten moment monarch money monk monkey monster month monument mood moon moral morale
morning mortal mortar mosaic moss most motel moth mother motion motive motor motto mound
mount mourn mouse mouth move movie much mud muffin mug mulberry mule mull multiple multiply
mumble mural muscle museum mushroom music musket must mustard mutiny mutter mutual muzzle
mystery myth naive name nanny nap napkin narrate narrow nasal nation native natural nature
nautical near neat nectar need needle neglect neighbor neither neon nerve nest net neutral
never new news nice niche nickel niece night nimble nine noble nod noise nomad none noodle
noon normal north nose notable notch note nothing notice notion noun nourish novel novice
nozzle nuance nudge number nurse nurture nut oak oasis oath oats obey object oblige oblong
obtain obtuse occasion occupy occur ocean odd odor offer office offset often oil old olive
omelet omit once onion only onset onto open opera opinion oppose optic option oracle oral
orange orbit orchard orchid ordain order organ orient origin ornate other otter ounce out
outcome outdoor outer outfit outlaw outlet outline output outrage outside oval oven over
owe owl own oxide oyster pace pack pact pad paddle page pageant pain paint pair palace
pale palm pan panel panic pansy pantry paper par parade pardon parent park parlor parole
parrot parse part party pass past pasta pastel pastor pastry pasture patch path patio
patrol patron pattern pause paw pay peace peach peak peanut pear pearl pebble pecan pedal
peer pen pencil pension people pepper perch perfect peril person pest pestle petal petty
phone photo phrase piano pick picnic picture pie piece pier pig pigeon pile pillow pilot
pin pinch pine pink pint pioneer pipe pit pitch pity pivot place plaid plain plan plane
planet plank plant plate play plea please pleat pledge plenty plot ploy pluck plug plum
plumb plume plunge plural plus pocket pod poem poet point polar pole police policy polish
polite pond pony pool poor poplar poppy porch pore port pose possess post pot potato
pottery pouch pound pour pout powder power praise prance pray preach precise predict prefer
premise prepare present press pressure pretty prevail prevent price pride priest prime
print prior prison private prize probe problem proceed process produce profit program
progress project promise prompt prone proof proper prose protect proud prove provide prune
pry public publish pudding puddle pull pulley pulp pulse pump punch punish pupil puppet
purchase pure purge purple purpose purse pursue push put puzzle quaint quake quality qualm
quarrel quart quarter quartz queen quench query quest queue quick quiet quill quilt quit
quite quiver quiz quota quote rabbit race rack radar radio raft rage raid rail rain raise
rake rally ranch random range rank rapid rare rash rasp rat rate rather ratio rattle raven
raw ray reach react read ready real realm reap rear reason rebel rebuke recall recede
recent recess recipe recite reckon record recover redeem reduce reed reef reel refer refine
reflect reform refrain refresh refuge refuse regal regard regime region regret reign rein
reject relate relax relay relic relief relish rely remain remark remedy remind remit remote
remove render renew rent repair repeat repel reply report rescue resent reserve reside
resign resist resort respect rest result resume retain retire retort return reveal revenge
revenue review revise revive revolt reward rhyme rhythm ribbon rice rich ride ridge right
rigid rim ring rinse riot ripe ripple rise risk ritual rival river roach road roam roast
robe robin robust rock rocket rod rogue roll roof room roost root rope rose rosy rot
rotary rough round rouse route routine rover row royal rub ruby rude rug ruin rule rumble
rumor run rung rural rush rust rustic rut sacred sad saddle safe sage sail saint salad
sale salmon salt salute sample sand sane sap sash satin satire sauce save savor say scale
scalp scan scant scar scare scarf scene scent scheme school scold scoop scope score scorn
scout scrap scratch scream screen screw script scroll scrub sea seal seam search season
seat second secret sect secure seed seek seem seep seize seldom select self sell send
sense sentence sequel series serve set settle seven severe sew shabby shade shadow shaft
shake shall shallow shame shape share sharp shave sheaf shear shed sheer sheet shelf shell
shelter shield shift shine ship shirt shock shoe shoot shop shore short shout shove show
shred shrewd shrink shrub shrug shut shy sick side siege sift sigh sight sign silence
silk sill silly silver simple sing single sink sip sir sister sit site six size skate
sketch ski skill skin skirt skull sky slab slam slap slate slave sled sleek sleep sleet
slender slice slick slide slight slim sling slink slip slit slogan slope slot slow small
smart smash smear smell smile smirk smoke smooth snack snail snap snarl sneak sneer sneeze
snore snout snow snug soak soap soar sob sober social sock soda sofa soft soil solar
sole solid solve sonar sonnet soon soot sorrow sort soul sound soup sour source south
space spade span spare spark sparse speak spear speech speed spell spend spice spill spin
spine spirit splash split spoil spoke sponge spoon sport spot spouse sprain sprawl spray
spread spring sprout spur spy square squat squeeze squid stable stack staff stage stain
stair stake stale stalk stamp stand staple star starch stare start startle stash state
statue status stay steady steak steal steam steel steep steer stem step stern stew stick
stiff still sting stir stitch stock stomach stone stool stop store storm story stove
strain strand strap straw stray streak stream street stress stretch stride strike string
strip stripe strive stroke stroll strong struggle stub stuck student studio study stuff
stump stun sturdy style subdue submit subtle suburb succeed such sudden suds suffer sugar
suggest suit sulky sum summit sun sundae sunny super supper supply sure surf surge survey
survive suspect sustain swallow swamp swan swap swarm sway swear sweat sweep sweet swell
swift swim swing swirl switch sword syrup table tackle tail tale talk tall tally tame
tan tang tank tap tape taper tar target tart task taste taught taunt tax tea teach team
tear tease tell temper temple tempt ten tend tender tennis tense tent term terror test
text thank thaw theft theme then theory thick thief thigh thing think thirst thorn thread
threat three thrill thrive throat throw thrust thumb thunder thus tick ticket tide tidy
tie tiger tight tile till tilt timber time tin tinge tint tiny tire title toad toast
today toe toil token toll tomato tone tongs tonic tool tooth top torch torment torn torso
toss total touch tough tour tow toward towel tower town trace track trade trail train
trait tramp trap travel tray tread treat tree trek trend trial tribe trick trim trip
triumph troop trot trouble trout truck true trunk trust truth try tub tube tuck tuft
tug tulip tumble tuna tune turf turn turtle tutor tweak twice twig twin twine twirl
twist type ugly ulcer uncle under undo unfit unify union unit unite unity until unwind
upon upper upset urban urge use usher usual utile utter vacant vague vain valid valor
value valve van vanilla vapor vary vast vault vegetable veil vein velvet vendor vent
verb verse very vest veto vice view vigor villa vine vinegar vintage vinyl viola violet
violin virtue visa visit visual vital vivid vocal voice void volcano volume vote vouch
vow wade wafer wag wage wagon waist wait waive wake walk wall walnut wander want ward
warm warn warp wash wasp waste watch water wave wax way weak wealth wear weave web wedge
weed week weep weigh weird welcome well west wet whale what wheat wheel when where which
while whim whine whip whirl whisk whisper whistle white whole wide widow width wife wild
will wilt win wince winch wind window wine wing wink winter wipe wire wise wish wit witch
with woe wolf woman wonder wood wool word work world worm worry worse worth would wound
wrap wreath wreck wrist write wrong yard yarn year yearn yeast yellow yield yoga yoke
yolk young youth zeal zest zone
`;

const WORDS_F = `
toasted steamed roasted brother weather oatmeal pretzel noodles storage staple listen
recipe enlist tinsel silent tiles inlets courses source rescue recourse creeds creeps
scoure scours singer resign country county tastier taster strait custard durst
`;

const WORD_LIST = (WORDS_A + WORDS_B + WORDS_C + WORDS_D + WORDS_E + WORDS_F)
  .toLowerCase()
  .split(/\s+/)
  .filter((w) => /^[a-z]{3,7}$/.test(w));

export const WORDS = Object.freeze([...new Set(WORD_LIST)].sort());
export const WORD_SET = new Set(WORDS);
export default WORDS;
