# SOP-ETCH-001 Gate etch RF match: high reflected power

Applies to: CX-Etch 300 chambers running gate etch (GATE-HBR recipes). Owner: Etch module engineering.

## Purpose

Restore plasma power delivery when reflected RF power rises. Reflected power means the match network is no longer tuned to the plasma, so part of the generator's power bounces back instead of reaching the wafer.

## Symptoms

- FDC reflected RF power above 20 W during the main etch step (normal is 10 to 14 W).
- RF-REFL-HI warnings from the tool, often repeating every few hours.
- Edge ring failures on the wafer map: dies in the outer band fail while the centre is clean. The plasma becomes unstable first at the wafer edge, so edge critical dimension and profile drift.
- Inline inspection finds ETCH-RESIDUE defects between 120 and 147 mm from the wafer centre.
- Symptoms often start within one or two days after a PM and get steadily worse.

## Likely causes

1. Match capacitor C1 or C2 not seated or calibrated correctly after a PM. This is the most common cause after maintenance.
2. A worn or cracked RF strap or connector between the match and the chamber.
3. A new edge ring with the wrong part number, which changes the electrical load at the wafer edge.
4. Generator fault (rare; check the forward power is stable at 1500 W).

## Checks, in order

1. Pull the FDC trend for reflected power on the chamber since its last PM. Compare it with the sister chamber on the same tool.
2. Run commonality on recent low-yield wafers to confirm that the chamber is the shared factor.
3. Check the PM record: was the match recalibrated, was capacitor C2 touched, which edge ring part was installed?
4. Inspect C1 and C2 tuning positions on the match controller; compare with the golden settings.

## Corrective action

- Put the chamber on hold for production (see SOP-YLD-002). The sister chamber can keep running.
- Re-seat and recalibrate match capacitors C1 and C2; run the auto-tune routine.
- Run 5 seasoning wafers, then 2 test wafers. Release only if reflected power is below 14 W and test wafer edge yield matches the sister chamber.
- Disposition affected lots with yield engineering. Do not scrap without a review.
