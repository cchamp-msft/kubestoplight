# village

A top-down map of the cluster. Nodes are settlements, pods are buildings, and a
pod holds the same plot of land for its entire life.

Open it with the **Village** switch in the header. Clicking a building opens the
same pod drill-down panel the grid uses.

## Why it exists

k9s and kubestoplight's own grid both order pods by values that move, so the pod
you were watching is somewhere else on the next poll. A map is only useful if
things stay where you left them. Everything here follows from that.

## Reading it

| You see | It means |
|---|---|
| A settlement | One node. Two clusters can both have a node called `fedora`, so settlements are keyed `cluster/node`. |
| The shape of the land | Not a container — the union of a disc around every claimed plot, with an edge that fades out over 40px. A settlement's outline is whatever its buildings actually cover. |
| Open country | Everything that is not a node: forest, meadow and watercourses. A pure function of world position, so it never crawls when the camera moves. |
| A village in a clearing | The canopy is held back around settled land, so a node sits in a glade it made. |
| Streets | Namespace seams. A street appears where two districts meet, so buildings front onto the road and neighbouring namespaces are across it. Which seams get paved is fixed per namespace pair, so some districts share a wall instead. Buildings either side step back to give the road its verge. |
| A trunk road between settlements | Those nodes are in the same cluster, and it is drawn wider than a village street because that is what it is — the link between two machines, not the gap between two districts. Separate clusters stay separate landmasses with open ground between them. |
| Cobbles, paving or bare earth | How much of its cluster the node carries, by live pod count: cobbles from 80%, bare earth under 10%, plain paving between. Worked out from the snapshot in `adapter.ts#groundFor`, with a little slack so a node on the line does not repave every poll. |
| A whole district built the same way | Each namespace holds one architecture pack for the session: village, castle, urban, brutalist, golden, sky or galaxy. You find a district by how it is built long before you can read its label. |
| Building shape *within* a pack | What the pod is. Silo or granary = a database or object store, whatever its controller shape. Gatehouse = an ingress, proxy or load balancer — traffic enters the town through it. Windmill = a CronJob pod, working on a schedule. Hayrick, woodpile, stone heap = a pod that has Succeeded — the work is done and what is left is the pile in the yard. Otherwise the controller: tower = StatefulSet member, cottage = Deployment replica, vault = DaemonSet, hall = static/mirror pod. See `roleOf()`. |
| Two to four silhouettes per role | Cosmetic variety, seeded from the pod key and fixed for the pod's life. A rebuilt pod gets a different one — a new house on the same land. |
| A tavern, forge, well, wizard's tower, dovecote, beehives, shrine, observatory, bell tower, standing stones, lighthouse, hollow tree, giant toadstool | A landmark, rolled at about 1 in 12 and weighted so some are far rarer. It means nothing about the pod, and only the village pack has any — a windmill in a brutalist district would not read as a surprise, it would read as a mistake. The windmill left this table when it became the CronJob's building: a silhouette is either folklore or vocabulary, never both. |
| People in the streets, carts on the trunk roads | Ambient life, and a real reading: how many are out scales with how much of the settlement is actually working. Stateless — each walker is a hashed speed and phase evaluated against the clock, so they survive re-renders and cost no bookkeeping. Walkers pace their street end to end; carts loop, wrapping at the road's faded ends where nobody sees the join. |
| Coloured plinth | Namespace livery. It travels with the building because namespaces span nodes. |
| Ring round the plinth | Health, drawn as an arc for the ready fraction — a half-drawn ring is a half-ready pod. |
| Chimney smoke, lit windows, sparks | Live CPU from metrics-server. Sparks are reserved for a building genuinely flat out (load above 0.8) — busy is carried by smoke, windows and foot traffic, because a merely busy building throwing sparks reads as a small explosion. No smoke anywhere means no metrics, not an idle cluster. |
| Soot down one side | Lifetime restarts. Scar tissue, not current activity — it does not animate. |
| Dashed outline, corner posts | Pending. You can see what *should* be there. |
| Fire and a cracked wall | CrashLoopBackOff, ImagePullBackOff, OOMKilled. |
| Rubble | A pod that left in the last 45s. Its household can rebuild on the same plot. |

## The stack

Bottom to top, and the order matters — each layer is the ground the next one
stands on:

```
terrain tiles      forest and meadow, masked by a density field
watercourses       stroked with the water tile, so they carry current not colour
loose scenery      tree and rock sprites, culled off roads, water and settled land
trunk roads        between settlements of one cluster
village ground     the settlement's own land, edge feathered into the country
village streets    baked into that same layer, blurred, so they fade out with the shoreline
buildings          painted back to front
particles          smoke, sparks, dust
```

Forest is a *texture*, with no tree or rock sprites on top: scattered props
meant nothing and popped in and out with zoom, so the country is canopy,
meadow and water only. Two clipped passes — a thinner outer fringe and a solid interior —
give the wood an edge that scatters out instead of a coastline.

## Layout

- Plot 0 is the centre of a settlement and plots are handed out by distance from
  it, so long-lived system pods sit in the old town and newcomers build on the
  outskirts. The order is by *noisy* radius, not by square ring: a square spiral
  fills a square, and no amount of drawing makes a square block of houses look
  like anything but a housing estate.
- A pod claims a plot on first sight, keyed `cluster/namespace/name`, and holds
  it until it leaves the snapshot. Nothing ever re-flows.
- When a pod dies its plot keeps that pod's *lineage* for 45 seconds. A
  replacement from the same controller inherits the land, so a rollout reads as
  rebuilding rather than relocating. `lineageOf()` derives the household from
  the pod name; getting it wrong only costs a cosmetic move.
- Otherwise, zoning. Each namespace has a fixed compass bearing from the town
  centre — its ward — hashed from its name. A newcomer picks the free plot by
  two readings compared *in order*: affinity first (kin — the same controller —
  counting triple a mere neighbour in the same colours), then arc distance from
  the ward's centreline. The order is the design: affinity-first is the
  guarantee a district stays one piece, the wedge only steers which edge it
  grows. Weigh them against each other instead and a perfectly-aligned but
  detached plot out-bids the district's own edge — wards come out as islands.
- For the scoring to be a choice at all, `claim()` keeps a frontier of roughly
  half a ring of unclaimed plots open ahead of the population. With the old
  single spare plot the pick was forced every time, which is why districts used
  to come out as patchwork no matter what the affinity said. The frontier is
  excluded from `settlementBounds()`, so it costs no ground on the map.
- On a fresh map everyone breaks ground in *civic* order — halls, then stores,
  gates, towers, vaults, mills, cottages, and the spent piles last — rather than
  snapshot order. A district's important buildings end up at its core, its
  piles on the outskirts, and the very first poll becomes deterministic: the
  same population builds the same town whatever order it arrived in.
- The replicas of one controller cluster into terraces (kin affinity), and a
  namespace's databases and civic buildings sit central to their ward — enough
  in-district structure to read, without a 1:1 matrix that would rot.
- Settlements are packed cluster-first. Trunk roads only join settlements of the
  same cluster, so those have to sit next to each other — otherwise the road
  passes straight through a third settlement and reads as connecting it.
- Two gap widths, `SETTLEMENT_GAP` within a cluster and `CLUSTER_GAP` between
  clusters. Nodes of one cluster really are wired together — the trunk road
  says so — and sit within hailing distance; a foreign cluster is a separate
  landmass, but the strait is kept narrow enough that framing every settlement
  does not mean zooming out past the point of reading any of them.
- Each settlement is tilted 6 to 16 degrees of its own, and each building sits up
  to 10px off its plot centre, plus up to a third of a tile away from any street
  on its boundary. Both are derived from names and ids, so nothing
  moves, and hit testing still works off the plain grid cell. The lattice is what
  makes a plot claim permanent; a *visible* lattice is what makes the map read as
  a street plan, and these are the two cheapest ways to break it.
  Rotating the sprites was tried and is wrong — they are lit from a fixed
  direction, so a turned building lights from the wrong side.

Streets are drawn into a scratch canvas and composited back through a blur, so
the metalling bleeds into the ground either side instead of stopping at a stroke
edge — a road with a crisp outline reads as a line drawn on top of the town. It
has to be the whole network at once: blurring stroke by stroke smears each pass
into the one under it and turns the surfacing to mud. `source-atop` keeps the
blur from pushing the road out past the shoreline. Trunk roads get the same soft
edge from four strokes stepping in from wide-and-faint to narrow-and-solid,
which is cheaper than a filter over the whole scene for a handful of polylines.

The land mask is drawn from the same setback positions as the buildings, so the
ground opens up along the road rather than the road being cut into a solid block.

Streets fade out at both ends over about a tile. A seam stops where two
districts stop bordering each other, which is an administrative fact and not
something a road does; fading turns the hard stop into a track petering out, and
it is also what stops a district ringed by seams from reading as a fenced plot —
the corners break, so the circuit becomes a set of lanes. Trunk roads fade the
same way, which is how they appear to arrive at a village rather than stop at it.

Clicking a namespace in the livery panel spotlights its district: the town is
drawn, washed back, and the chosen buildings relit on top. Lowering their alpha
instead makes already-dark buildings vanish and leaves the roads as the loudest
thing on screen.

`layout.test.ts` covers all of the above — steady state, snapshot reordering,
rollout inheritance, bystanders, rubble expiry, and cluster/node collisions.

## Files

```
types.ts      village domain model — no Kubernetes anywhere
layout.ts     plot order, plot assignment, lineage, streets        <- the pinning
adapter.ts    NamespaceGroup[] -> Dweller[]                        <- the only k8s-aware file
render.ts     canvas drawing, countryside, particles, hit testing
sprites.ts    art loading, architecture packs, silhouette choice, landmark weights
VillageView.tsx  camera, picking, tooltip, legend
```

The seam is `adapter.ts`. Everything else speaks villages, so pointing a
different adapter at `layout.ts` + `render.ts` draws something else entirely.

To split this into its own repo later, use `git subtree split -P web/src/village`
— that produces a real repository with this directory's history intact. Do not
`git init` inside the subdirectory: it works, but the parent repo then either
ignores it or records a gitlink you did not mean to create.

## Art

Sprites live in `web/public/village-art/` (not `village/`: that is the page's URL) and load at runtime through `sprites.ts`.
They are optional in the strict sense: `loadAtlas()` never rejects, and if the
files are missing the renderer falls back to the procedural vector shapes it used
before there was any art — `drawBuilding()` / `drawGround()` are still there and
still work.

116 buildings, 12 pieces of scenery, three ground textures and three terrain
tiles, generated as eleven sheets on a flat magenta background rather than as
separate images — a single generation per sheet is the only reliable way to get
identical lighting, angle and scale across it. Each sheet was keyed,
spill-suppressed, sliced and downsampled.

Later single additions (the gatehouse) are generated one at a time by img2img
against two existing sprites as style references, which holds lighting, angle
and palette well enough that the sheet trick is not needed for a lone building.
The same key → spill-suppress → crop → downsample → grade pipeline applies,
grading against `hall.png` rather than the nominal mean.

Slicing is by connected component, and nothing about the grid is assumed. Three
things were tried and are wrong:

- A fixed grid cut. The generator does not centre objects in their cells, so a
  tower's spire pokes into the row above and gets sheared off. Worse, it does not
  reliably use the grid it is asked for at all — three of the seven pack sheets
  came back with five rows when the prompt specified four, and two came back with
  fourteen objects instead of twelve.
- Merging blobs whose bounding boxes are near each other. On an isometric sheet a
  tall object's box covers its neighbour, so this welds the whole sheet into one
  object as soon as the spacing is tight. Four of the seven sheets collapsed to a
  single piece.
- Segmenting by projection profile. Sound in principle, but it needs a run of
  fully transparent rows between bands, and a tall object overlapping the row
  above removes it.

One connected blob is one object, ordered by where its *base* sits rather than
its top, and the naming table is written by hand against a numbered contact
sheet. Anything that splits — a siege crane clear of its stones — is glued or
dropped there. Over-segmentation is visible on the contact sheet and fixable;
welding is neither.

Each sheet is then graded toward the luminance of the set already on disk (mean
L 57). The gilded pack came out at 135 and the sky-city pack at 149; left alone
they read as lit rather than as built from different materials.

Scenery and ground textures are graded down at slice time. They are generated in
daylight and the buildings are lit for night, so ungraded a tree out-shines the
village it stands beside and the ground out-glows the houses on it.

The three terrain tiles are plan-view and have to wrap, which a generated image
has no reason to do. `tiles.mjs` rolls each one half a period so its edges land
in the middle, then cross-fades only that cross against a differently-rolled
copy, which is clean there because its own seam is elsewhere. Blending the whole
tile bilinearly — the obvious approach — leaves a ghosted X in every copy, which
is more obvious than the seam it fixes. Their low frequencies are then removed:
repetition reads through large-scale brightness long before it reads through
detail, so one bright patch in the tile becomes a stain in a grid across the map.

The buildings stay stone. Recolouring them per namespace would throw the art
away, so the four data channels layer *around* the sprite instead:

- livery -> the plinth underneath
- health -> the ring around the plinth
- CPU    -> additive window glow, chimney smoke, forge sparks
- restarts -> a soot smudge, which does not animate because it is history

Sprites are taller than their footprint, so `drawVillage` paints plots in
`(gy, gx)` order. Skip that and towers punch holes through their neighbours.

Each settlement's ground and streets go into one offscreen canvas,
rebuilt only when the claimed plots or the placement change. It has to be
offscreen because of the edge: the land is masked by a stack of expanding fills
that ramp the alpha up from nothing, and you cannot fade an edge that way by
painting over the top — there is scenery underneath that has to show through.

Two traps in there, both silent, both worth not rediscovering:

- A full-canvas `fillRect` given in world coordinates rasterizes to **nothing**
  once the transform's translate gets large. The third settlement across the map
  lost its ground while the first two were fine. `cover()` takes the pan back
  out of the transform before filling.
- `placeSettlements` derives its candidate row widths by one summation and tests
  the wrap by another, so the widest candidate came out a rounding step under
  the row it was derived from and wrapped anyway. The packer could never use its
  own widest row, and every map came out squarer than the window. Hence the
  epsilon on that comparison.
