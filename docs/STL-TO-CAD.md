# STL to CAD in Formnaro

Available in **0.127.0 Nightly r10**. [Deutsch](GEMEINSAMER-KONVERTER.md)

## Open and check an STL

Choose **Import**, select an STL and choose **reconstruct as CAD**. The converter also opens through **Functions → STL → STEP**. Check the input unit, displayed dimensions and deviation budget.

**Local first · use AI selectively** prepares and checks a local STEP candidate first. A valid local candidate can reach the CAD preview without an AI request. Compare Original, Result and Overlay, then apply the CAD preview or save STEP. Applying adds one project Undo step.

The original preview works independently of segmentation. A mesh above the region editor's 20,000-triangle limit may still convert locally.

## Refine individual regions

Local deviation samples can identify suspect regions. The assistant can examine these regions and their direct edge neighbours. You can also analyse the surfaces, mark a few regions and request a targeted correction. If local conversion fails without a usable location, analyse and mark the region before retrying.

Automatic refinement uses at most two provider requests within 90 seconds. Unit, tolerance and conversion settings are pinned. The application checks proposals locally and retains the valid local candidate when refinement fails, is cancelled, or gives no measured improvement. Region measurements go to the provider; raw STL triangles stay local. Provider access and billing use the shared Formnaro AI settings.

Manual region editing and manual AI proposals are also available.

## Reconstruct a symmetric part

1. Open **Symmetry · reconstruct one side**.
2. Select the axis normal to the known symmetry plane, its position in millimetres, and the side to use. A blank position uses the centre of the input bounds.
3. Set the overlap or leave it automatic. Automatic overlap is five times the deviation budget. A specified overlap must exceed twice that budget.
4. Start the check. Formnaro compares the original with its reflection, reconstructs one overlapping side, then mirrors and joins the CAD bodies.
5. Review the CAD preview. The STEP must reopen as one closed solid and pass bidirectional surface and seam samples. Apply or discard it.

The mode supports one closed, consistently oriented component, an axis-aligned plane, at most 40,000 original triangles and at most 20,000 triangles in the overlapping side. A material difference between the original sides rejects the operation. Coordinate rounding is included in the precision budget. Choose the reference side from your knowledge of the intended part. The mode does not identify the intended side of a damaged scan automatically.

## Limits

- STL input is limited to 50 MiB and STEP import to 30 MiB. A mesh below 20,000 triangles can still produce an oversized STEP.
- Very small input dimensions relative to the budget prompt a unit check. Units are explicitly selected.
- Deviations are measured samples with a meshing allowance, without a guaranteed global maximum.
- Difficult areas may stay faceted. STL conversion does not recover original sketches or construction history.
- Conversion works on temporary input. The project changes only when the final CAD preview is applied.

See the [r10 release](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.127.0-r10) for downloads and verification scope.
