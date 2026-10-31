"""Lokale, überprüfbare STL-Rückführung."""

import os

# Small fitting systems gain little from large BLAS thread pools. Cap defaults
# for this application's processes to avoid excessive Windows commit usage.
for _variable in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMBA_NUM_THREADS"):
    os.environ.setdefault(_variable, "1")

__version__ = "0.10.0"
