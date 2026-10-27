"""Native loft cutter from explicit measured planar contours.

Each section is {points: [[u,v], ...], frame: column-major world frame}.
Use complete single closed contours (3..128 vertices). No inference, repair,
simplification, omitted holes or accuracy guarantee is performed here.
Measure both sides of material steps; preserve final independent surface checks.
"""

def cut_measured_loft(model, body, sections, *, alias=None, name='Measured loft cut'):
    if len(sections) < 2:
        raise ValueError('At least two measured sections are required')
    for section in sections:
        if set(section) != {'points', 'frame'}:
            raise ValueError('Each section needs complete points and its measured frame')
        if not 3 <= len(section['points']) <= 128 or len(section['frame']) != 16:
            raise ValueError('3..128 complete vertices and a world frame are required')
    profiles = [model.polygon(s['points'], 0.01, plane=s['frame'], name=name+' section '+str(i+1))
                for i, s in enumerate(sections)]
    tool = model.loft(*profiles, name=name+' tool')
    return model.cut(body, tool, alias=alias, name=name)
