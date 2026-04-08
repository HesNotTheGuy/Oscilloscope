'use strict';

// ─────────────────────────────────────────────────────────────
//  Step tables — standard oscilloscope values
// ─────────────────────────────────────────────────────────────
export const TIMEBASE = [
  // ── μs range ──────────────────────────────────────────────
  { label: '1μs',   s: 1e-6    }, { label: '1.5μs', s: 1.5e-6  },
  { label: '2μs',   s: 2e-6    }, { label: '2.5μs', s: 2.5e-6  },
  { label: '3μs',   s: 3e-6    }, { label: '4μs',   s: 4e-6    },
  { label: '5μs',   s: 5e-6    }, { label: '7.5μs', s: 7.5e-6  },
  { label: '10μs',  s: 10e-6   }, { label: '15μs',  s: 15e-6   },
  { label: '20μs',  s: 20e-6   }, { label: '25μs',  s: 25e-6   },
  { label: '30μs',  s: 30e-6   }, { label: '40μs',  s: 40e-6   },
  { label: '50μs',  s: 50e-6   }, { label: '75μs',  s: 75e-6   },
  { label: '100μs', s: 100e-6  }, { label: '150μs', s: 150e-6  },
  { label: '200μs', s: 200e-6  }, { label: '250μs', s: 250e-6  },
  { label: '300μs', s: 300e-6  }, { label: '400μs', s: 400e-6  },
  { label: '500μs', s: 500e-6  }, { label: '750μs', s: 750e-6  },
  // ── ms range ──────────────────────────────────────────────
  { label: '1ms',   s: 1e-3    }, { label: '1.5ms', s: 1.5e-3  },
  { label: '2ms',   s: 2e-3    }, { label: '2.5ms', s: 2.5e-3  },
  { label: '3ms',   s: 3e-3    }, { label: '4ms',   s: 4e-3    },
  { label: '5ms',   s: 5e-3    }, { label: '7.5ms', s: 7.5e-3  },
  { label: '10ms',  s: 10e-3   }, { label: '15ms',  s: 15e-3   },
  { label: '20ms',  s: 20e-3   }, { label: '25ms',  s: 25e-3   },
  { label: '30ms',  s: 30e-3   }, { label: '40ms',  s: 40e-3   },
  { label: '50ms',  s: 50e-3   }, { label: '75ms',  s: 75e-3   },
  { label: '100ms', s: 100e-3  }, { label: '150ms', s: 150e-3  },
  { label: '200ms', s: 200e-3  }, { label: '250ms', s: 250e-3  },
  { label: '300ms', s: 300e-3  }, { label: '400ms', s: 400e-3  },
  { label: '500ms', s: 500e-3  }, { label: '750ms', s: 750e-3  },
  // ── s range ───────────────────────────────────────────────
  { label: '1s',    s: 1       }, { label: '1.5s',  s: 1.5     },
  { label: '2s',    s: 2       }, { label: '2.5s',  s: 2.5     },
  { label: '3s',    s: 3       }, { label: '5s',    s: 5       },
  { label: '7.5s',  s: 7.5     }, { label: '10s',   s: 10      },
];
export const TB_DEFAULT = 24; // 1ms

export const VDIV = [
  { label: '50mV',  v: 0.05 }, { label: '100mV', v: 0.1  },
  { label: '200mV', v: 0.2  }, { label: '500mV', v: 0.5  },
  { label: '1V',    v: 1.0  }, { label: '2V',    v: 2.0  },
  { label: '5V',    v: 5.0  },
];
export const VD_DEFAULT = 3; // 500mV

// Lissajous frequency ratios (L:R)
export const LISSAJOUS_RATIOS = [
  { label: '1:1', r: 1     },
  { label: '1:2', r: 2     },
  { label: '2:3', r: 1.5   },
  { label: '3:4', r: 4/3   },
  { label: '3:5', r: 5/3   },
  { label: '5:6', r: 6/5   },
  { label: '5:8', r: 8/5   },
];
