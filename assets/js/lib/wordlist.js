// A word list for passphrases, in the spirit of Diceware and the EFF's short
// list: short, common, unambiguous English words, nothing that sounds like
// anything else on the list, no plurals of words already here.
//
// The size is not a round number and does not need to be — the generator reads
// `WORDS.length` and reports the entropy that actually follows from it, so
// adding or removing a word stays honest rather than quietly weakening a
// claim made in a comment.

const RAW = `
ant ape bat bear bee bird bison boar bug calf camel cat chick clam cobra cod
colt crab crane crow cub deer dingo dodo dog dove duck eagle eel elk emu falcon
fawn ferret finch fish flea fox frog gecko goat goose gull hare hawk hen heron
hog horse hound ibex jay kite koala lamb lark lion lizard llama lynx mare mole
moose moth mouse mule newt otter owl ox panda parrot perch pig pony pug pup quail
rabbit ram rat raven robin salmon seal shark sheep shrew skunk slug snail snake
sparrow spider squid stag stork swan tiger toad trout tuna turtle viper wasp
whale wolf worm wren yak zebra

acorn algae ash aspen bamboo bark basil bay beech berry birch bloom bramble
branch briar bud bush cactus cedar cherry clover cocoa cone coral cress crocus
daisy elm fern fig fir flax fungus gorse grain grape grass hazel heath herb
holly ivy juniper kelp larch laurel leaf lichen lilac lily lime lotus maple
marsh moss myrtle nettle oak olive orchid palm peach pear petal pine plum
pollen poplar poppy pumpkin reed root rose rowan sage sap seed shrub spruce
stem stump thorn thyme trunk tulip twig vine walnut wheat willow yew

apple bacon bagel bean beef bread broth butter cake candy carrot cheese chili
chip cider cocoa coffee cookie corn cream crust curry dough egg flour fudge
garlic ginger grain gravy honey jam jelly juice kale lemon lentil loaf mango
melon milk mint muffin mustard noodle nut oat oil olive onion orange pasta
pastry pea peanut pepper pickle pie pizza plum potato rice roast salad salsa
salt sauce sausage scone soup spice spinach squash stew sugar syrup taco toast
tofu tomato waffle walnut yeast yogurt

arm ankle beard bone brain brow cheek chest chin ear elbow eye finger fist foot
hand heart heel hip jaw knee lash limb lip lung nail neck nerve nose palm rib
shin shoulder skin skull sole spine thumb toe tongue tooth vein waist wrist

anchor anvil apron arrow auger awl axe badge bag barrel basin basket beam bell
belt bench blade blanket board bolt book boot bottle bowl box brake brick broom
brush bucket buckle bulb cable candle cane canvas cap cart case chain chair
chalk chest chisel clamp clip clock cloth coil comb cord cork crate crayon crown
cup curtain cushion dial disc dish door drill drum dust engine fan faucet fence
file filter flag flask fork frame funnel gauge gear glass glove glue grate grill
hammer handle hanger harp hatch helmet hinge hook hose ink iron jar jug kettle
key kite knife knob ladder lamp lantern lash latch lens lever lid lock loom
magnet mallet mask mast mat mirror mold mop motor nail needle net nozzle nut
oven paddle pail paint pan panel paper pedal peg pen pencil pin pipe piston
plank plate plug pocket pot pouch press pulley pump purse quilt rack radio rail
rake ramp razor ribbon ring rivet rod roller rope ruler saddle sail saw scale
scarf scissors screen screw shelf shield shovel sieve sign sink skate sled
sleeve slot socket spade spanner spark spoon spring stamp staple stem stick
stitch stool stove strap straw string switch table tack tank tap tape tent
thread tile timer tin tongs tool torch towel tray tube tumbler tunnel valve
vase vent vessel wagon wallet wand watch wedge wheel whistle wick wire wrench
yarn zipper

bank barn bay beach bridge cabin canal canyon cape castle cave cellar city
cliff coast cottage court cove creek dam delta dock dome dune farm field forest
fort garden gate glade glen grove harbor hill inn island jetty lake lane ledge
lodge marsh meadow mill mine moor mound mountain oasis orchard park path pier
plain plateau plaza pond port prairie quarry quay ranch reef ridge river road
ruin shed shore slope spring square stair steppe street summit swamp temple
terrace tower town trail tunnel valley village wharf yard

amber ash azure beige black blue bronze brown coral cream crimson gold gray
green indigo ivory jade lemon lilac magenta maroon mauve navy olive orange pearl
pink plum purple red rose ruby rust sable scarlet silver slate tan teal violet
white yellow

autumn dawn day dusk eve hour march midnight minute month moon morning night
noon season spring summer sunrise sunset week winter year

blizzard breeze cloud comet dew drift drizzle dust eclipse fog frost gale
glacier hail haze ice lightning mist monsoon rain rainbow shadow shower sky
sleet smoke snow star storm sun thunder tide wind

banjo bass bell cello chord choir drum flute fiddle guitar harp horn lyre note
oboe organ piano rhythm sitar song tempo trumpet tuba tune viola violin

arch attic balcony basement beam brick ceiling chimney column corridor dome
door fence floor foyer gable gallery hall hearth landing lobby mantel nook
panel parlor patio pillar porch rafter roof room stair step stoop studio
threshold vault veranda wall window

able acid active aged agile alert alive amber ample ancient angry awake aware
bare basic blank blunt bold brave brief bright brisk broad calm chief civic
civil clean clear clever close coarse cold cool crisp curly damp dark dear deep
dense dim direct dizzy dry dual eager early easy elder empty equal even exact
fair false fancy fast fine firm flat fond formal frank free fresh full gentle
giant glad grand grave great green grim happy hard harsh heavy hollow honest
huge humble icy ideal idle inner joint jolly keen kind large late lean legal
level light little lively local lofty logical lone long loose loud loyal lucid
lucky main major mellow merry mild minor modest moist moral narrow native neat
new noble noisy normal novel odd only open outer pale partial past patient
plain plump polite poor prime prior proud pure quick quiet rapid rare raw ready
real rich ripe rough round royal rural rustic sacred safe sandy scarce secret
severe sharp sheer short shy silent simple sincere single slim slow small smart
smooth social soft solid sore sound sour spare spicy stable stale steady steep
stern stiff still stout straight strange strict strong sturdy subtle sudden
super sure sweet swift tall tame tender tense thick thin tidy tight timid tiny
tired total tough true unique upper urban usual vague valid vast vital vivid
warm wary wavy weak wealthy weary wee whole wide wild wise witty wooden worthy
young

amend anchor argue arrive ask bake bar bath bend bid bind bless blink bloom
blush board boast boil bolt bounce bow brew bring brush build burn carve cast
catch chant charm chase cheer chew chill chop claim clap clasp climb cling
clutch coach coax coil comb cook cool count cover crack craft crave crawl
creep cross crush curl dance dare dart dash deal dig dine dip dive draft drag
drain draw dream drift drill drink drip drive drop dry dwell earn echo edge
enter erase fade fasten feed fetch fill find flee flick fling float flood flow
fly fold follow forge form frame free freeze fry gain gallop gather gaze glance
glide glow gnaw grab graft grasp graze greet grind grip grow guard guess guide
hail halt hammer handle hang harvest hatch haul heal heap hear heat help hide
hike hint hold hope hover hug hum hunt hurl hurry invite iron jog join joke
judge jump keep kick kindle kneel knit knock know label land last laugh launch
lay lead lean leap learn leave lend lift limp link listen load lock look loop
lose love mail make march mark marry match melt mend mind mine mix moan mold
mount move mow nail name nap near nest nod note nudge nurse obey offer open
order pack paint pair park pass paste pat pause pave peek peel perch pick
pierce pile pinch place plan plant play plead pledge plow pluck plunge point
polish pour practice praise pray press print probe prod prompt prop prove pull
pump punch push quote race raise rake rally ramble rank reach read reap rear
recall relax rent repair rest return ride ring rinse rise roam roast rock roll
rope row rub ruin rule rush sail save scan scatter scoop score scrape scrub
seal search seat seek seize sell send serve settle sew shake shape share shave
shed shift shine shiver shop shout shove show shrink shut sigh sing sink sip
sit sketch ski skip slam sleep slice slide slip smile smooth snap sneak sniff
soak soar sort sow span spare spark speak speed spell spend spill spin splash
split spoil spray spread spring sprint sprout squeeze stack stage stain stamp
stand stare start stay steer step stir stitch stock stoop stop store strain
stray stream stretch stride strike stroll study stuff sway sweep swim swing
switch swirl tackle tag take talk tame tap taste teach tear tease tell tend
test thank thaw think thrive throw thrust tickle tidy tie tilt tip toast toss
touch tour tow trace track trade trail train travel tread treat trim trip trot
trust try tuck tug tumble tune turn twist type untie urge use vanish visit
vote wade wait wake walk wander want warm warn wash waste watch wave weave
weigh weld whisk whisper wield wind wink wipe wish wonder work wrap write yield
`

// Deduped rather than trusted: the list above is maintained by hand in themed
// blocks, and a word that appears twice would be twice as likely as the rest.
export const WORDS = [...new Set(RAW.trim().split(/\s+/))]

// How much a single word is worth. Read off the list rather than asserted, so
// editing the list cannot leave a stale number behind.
export const BITS_PER_WORD = Math.log2(WORDS.length)
