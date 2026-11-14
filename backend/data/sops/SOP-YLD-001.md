# SOP-YLD-001 Wafer map pattern guide

Applies to: yield engineering, wafer sort data review.

## How to use this guide

Look at the failing dies on the wafer map, name the pattern, and use it to narrow down which process area to investigate. A pattern is a clue, not a proof: confirm with commonality and tool data.

## Edge ring

Failing dies in a band around the outer edge, centre clean. Usual suspects: plasma etch problems at the wafer edge (RF match, edge ring, focus ring), edge bead removal in lithography, or CMP edge roll-off. If the failing wafers share one etch chamber, start with SOP-ETCH-001.

## Cluster

A group of touching failing dies anywhere on the wafer. Usual suspects: a particle or contamination event, a handling scratch, a CMP defect. Check inline inspection images for the same spot.

## Scratch

A thin line of failing dies, often curved. Usual suspects: CMP pad or conditioner damage, wafer handling robots. See SOP-CMP-001.

## Centre spot

Failing dies near the centre. Usual suspects: ESC or temperature problems in etch (see SOP-ETCH-003), deposition thickness non-uniformity.

## Random

Failing dies spread evenly with no pattern, at the normal rate. This is baseline defectivity and usually needs no action unless the rate rises.
