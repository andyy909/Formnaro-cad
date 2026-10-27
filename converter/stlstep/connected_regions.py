"""Connected freeform proposals alongside retained measured analytic regions."""
from .local_regions import MAX_FACES, _cancel


def analyse_connected_regions(mesh,tolerance,cancel_event=None):
    from .advanced_regions import analyse_advanced_regions
    from .meridian_regions import meridian_analysis
    from .freeform_regions import graph_analysis
    analysis=analyse_advanced_regions(mesh,tolerance,cancel_event)
    if len(mesh.faces)>MAX_FACES:
        return analysis
    _cancel(cancel_event)
    analysis=meridian_analysis(mesh,analysis,tolerance,cancel_event) or analysis
    analysis=graph_analysis(mesh,analysis,tolerance,cancel_event) or analysis
    return analysis


def connected_region_shapes(mesh,tolerance,progress=None,*,cancel_event=None):
    """Try combinations separately; one unsuitable graph cannot erase a meridian.

    Each yielded body has passed the native shared-boundary construction. The
    caller must still check global deviation/topology and the actual STEP.
    """
    from .advanced_regions import analyse_advanced_regions,advanced_region_shape
    from .meridian_regions import meridian_analysis
    from .freeform_regions import graph_analysis
    if len(mesh.faces)>MAX_FACES:
        return
    original=analyse_advanced_regions(mesh,tolerance,cancel_event)
    meridian=meridian_analysis(mesh,original,tolerance,cancel_event)
    graph=graph_analysis(mesh,meridian or original,tolerance,cancel_event)
    variants=[]
    if graph is not None:
        variants.append(('graphs_and_meridians' if meridian else 'graphs',graph))
    if meridian is not None:
        variants.append(('meridians',meridian))
        graph_only=graph_analysis(mesh,original,tolerance,cancel_event)
        if graph_only is not None:
            variants.append(('graphs',graph_only))
    rejected=[]
    for name,analysis in variants:
        _cancel(cancel_event)
        try:
            result=advanced_region_shape(mesh,tolerance,progress,analysis=analysis,cancel_event=cancel_event)
        except ValueError as exc:
            _cancel(cancel_event)
            rejected.append(dict(variant=name,reason=str(exc)))
            continue
        if result is None:
            continue
        shape,details=result
        graphs=[r for r in analysis.regions if r['type']=='GRAPH']
        meridians=[r for r in analysis.regions if r['type']=='REVOLUTION']
        details.update(kind='connected_BSpline_freeform_regions',variant=name,graph_patches=len(graphs),
                       graph_regions=graphs,meridian_regions=meridians,rejected_native_variants=list(rejected))
        yield shape,details


def connected_region_shape(mesh,tolerance,progress=None,*,cancel_event=None):
    return next(connected_region_shapes(mesh,tolerance,progress,cancel_event=cancel_event),None)
