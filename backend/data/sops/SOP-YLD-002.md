# SOP-YLD-002 Yield excursion response and OCAP

Applies to: yield engineering, module engineering, shift supervisors.

## What counts as an excursion

- A lot whose mean yield is more than 3 sigma below the product baseline.
- Two or more lots with the same wafer map pattern within 48 hours.
- An SPC rule violation on a critical FDC parameter.

## Out-of-control action plan (OCAP)

1. Contain: place the suspect chamber on hold for production. Hold the affected lots that have not finished.
2. Investigate: run commonality across the low-yield wafers; review FDC, alarms and recent maintenance on the common chamber.
3. Correct: raise a work order for the module team with the evidence (lots, wafer maps, SPC chart, PM record).
4. Verify: release the chamber only after its qualification passes (for etch, SOP-ETCH-002).
5. Record: write a short excursion report within 24 hours.

## Work orders

A work order must name the chamber, the suspected cause, the evidence, and the requested action. Work orders are drafted by engineering or by the FabCopilot assistant, and must be approved by a human engineer before the module team acts on them. No tool or chamber may be put on hold by software alone.
