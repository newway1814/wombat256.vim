# SOP-SPC-001 Statistical process control: rules and response

Applies to: all FDC parameters on the critical parameter list, including etch reflected RF power.

## Control charts

Each point is the mean of the wafers one lot ran through the chamber (X-bar chart). Control limits are the centre line plus and minus 3 sigma, calculated from a stable baseline period. Recalculate limits only after a documented process change, never to make an alarm go away.

## Western Electric rules

1. One point beyond 3 sigma.
2. Two of three consecutive points beyond 2 sigma on the same side.
3. Four of five consecutive points beyond 1 sigma on the same side.
4. Eight consecutive points on the same side of the centre line.

## Response

- Rule 1 on a critical parameter: stop and follow SOP-YLD-002.
- Rules 2 to 4: a shift or drift is likely. Notify the module engineer and review recent maintenance.
- After a PM, compare the mean before and after the PM; a shift with a p-value below 0.01 needs an explanation.
