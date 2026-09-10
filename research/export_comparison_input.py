"""Export an input or overall scores from the research platform.

Run in the research Python environment with --model-root pointing to
will_neuro_intern/01_artificial_synapse. This script writes only the portfolio
export. It does not change the research inputs, models, or benchmark scores.
"""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd


PROTOCOL = "synthetic_two_bursts_10spikes"
BLUM_PROTOCOL = "blum_dynamic_ramp_hold_aff1"
MODEL_RUNS = {
    "tm": ("Tsodyks-Markram STP", None),
    "exp2": ("NEURON Exp2Syn", None),
    "fan": ("Fan", "Fan reconstruction + calibrated delay"),
    "bohao": ("Bohao PPF", "Bohao PPF, V2-calibrated parameters + calibrated delay"),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-root", required=True, type=Path)
    parser.add_argument("--protocol", choices=(PROTOCOL, BLUM_PROTOCOL), default=PROTOCOL)
    parser.add_argument("--scores-only", action="store_true", help="Refresh the platform's overall scores without rebuilding waveforms")
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "animations/model_output_comparison_data.js")
    args = parser.parse_args()
    sys.path.insert(0, str(args.model_root.resolve()))
    import data_source as ds
    from _11_targets.v2 import version2_steps as steps

    raw = args.output.read_text()
    document = json.loads(raw.split("=", 1)[1].strip().removesuffix(";"))
    if args.scores_only:
        document["benchmark"] = export_scores(ds, args.model_root)
        write_export(document, args.output)
        print(json.dumps(document["benchmark"], indent=2))
        return

    def run(model_key, protocol):
        name, variant = MODEL_RUNS[model_key]
        candidate = ds.dr.get_candidate(variant) if variant else None
        return ds.build_run(name, protocol, "EPSC", candidate)

    def export_run(protocol, label, role, timing_source, timing_evidence):
        reference = run("tm", protocol)
        data = {
            "label": label, "role": role,
            "response_type": "EPSC", "response_unit": "nS",
            "timing_source": timing_source, "timing_evidence": timing_evidence,
            "source": "Version 2 target generator and data_source.build_run",
            "source_sample_count": len(reference.input_time_ms),
            "display_sample_count": len(reference.input_time_ms),
            "time_ms": np.round(reference.input_time_ms, 3).tolist(),
            "events_ms": np.round(reference.event_time_ms, 3).tolist(),
            "input": np.round(reference.input_voltage_mV, 5).tolist(),
            "target": np.round(reference.target_nS, 5).tolist(),
            "tm": np.round(reference.output_nS, 5).tolist(),
            **{key: np.round(run(key, protocol).output_nS, 5).tolist() for key in MODEL_RUNS if key != "tm"},
        }
        return data

    # Fail before writing if the installed research source has drifted from the
    # exported models. All existing traces and scores remain unchanged.
    max_difference = 0.0
    for name, stored in document["protocols"].items():
        if name in (PROTOCOL, args.protocol):
            continue
        reference = run("tm", name)
        count = len(reference.input_time_ms)
        indices = np.arange(count) if count == len(stored["time_ms"]) else np.unique(np.rint(np.linspace(0, count - 1, len(stored["time_ms"]))).astype(int))
        np.testing.assert_allclose(np.round(reference.input_time_ms[indices], 3), stored["time_ms"], atol=1e-9)
        arrays = {"input": reference.input_voltage_mV, "target": reference.target_nS, "tm": reference.output_nS}
        arrays.update({key: run(key, name).output_nS for key in MODEL_RUNS if key != "tm"})
        for key, values in arrays.items():
            difference = float(np.max(np.abs(np.round(values[indices], 5) - np.asarray(stored[key]))))
            max_difference = max(max_difference, difference)
            if difference > 1e-4:
                raise ValueError(f"Research source differs from saved {name}/{key}: {difference:g}")

    if args.protocol == BLUM_PROTOCOL:
        spec = steps.load_blum_timing_protocols()[BLUM_PROTOCOL]
        events = np.asarray(spec["event_times_ms"])
        data = export_run(BLUM_PROTOCOL, f"Blum dynamic train ({len(events)} spikes)", ds.protocol_role(BLUM_PROTOCOL), spec["timing_source"], spec["timing_evidence"])
    else:
        data, events = export_two_bursts(args.model_root, ds, steps, export_run)

    np.testing.assert_allclose(data["events_ms"], events, atol=0.051)
    for key in ("input", "target", *MODEL_RUNS):
        assert len(data[key]) == len(data["time_ms"])
        assert np.isfinite(data[key]).all()
    document["protocols"][args.protocol] = data
    document["metadata"]["response_unit"] = "nS"
    document["metadata"]["display_resampling"] = "Original exports use up to 2400 samples; inputs from export_comparison_input.py retain all 0.05 ms samples."
    write_export(document, args.output)
    print(json.dumps({"protocol": args.protocol, "events": len(data["events_ms"]), "samples": len(data["time_ms"]), "existing_trace_max_difference": max_difference}))


def write_export(document, output):
    output.write_text("// Research model outputs and scores; see ../export_comparison_input.py.\nwindow.MODEL_OUTPUT_COMPARISON_DATA=" + json.dumps(document, separators=(",", ":"), ensure_ascii=True) + ";\n")


def export_scores(ds, model_root):
    protocols = ds.prediction_protocols()
    rows = {row.model: row for row in ds.score_table_both(protocols)}
    models = []
    for key, (model, variant) in MODEL_RUNS.items():
        row = rows[variant or model]
        assert not row.includes_calibration
        assert row.first_series.protocol_count == row.second_series.protocol_count == len(protocols)
        scores = (row.general_score, row.magnitude_score, row.shape_score)
        assert np.isfinite(scores).all() and all(0 <= score <= 100 for score in scores)
        models.append({"key": key, "model": row.model,
            "overall_score": row.general_score, "magnitude_score": row.magnitude_score, "shape_score": row.shape_score})
    models.sort(key=lambda model: -model["overall_score"])
    return {
        "metric": "platform_overall_score", "scale": [0, 100], "higher_is_better": True,
        "source": "data_source.score_table_both(data_source.prediction_protocols())",
        "protocols": list(protocols), "response_types": list(ds.RESPONSE_TYPES),
        "source_score_table_sha256": hashlib.sha256((model_root / "_08_outputs/platform_scores.csv").read_bytes()).hexdigest(),
        "source_scoring_sha256": hashlib.sha256((model_root / "_09_benchmark/scoring.py").read_bytes()).hexdigest(),
        "models": models,
    }


def export_two_bursts(model_root, ds, steps, export_run):
    original_inputs = ds._v2_inputs
    original_targets = ds._v2_train_waveforms
    inputs = original_inputs()
    targets = original_targets()
    single = inputs[inputs["protocol"].eq("single_spike")]
    spike = single.rename(columns={"time_ms": "time_from_spike_threshold_ms"})
    events = np.array([0, 10, 20, 30, 40, 120, 130, 140, 150, 160], dtype=float)
    custom_inputs = steps.build_input_protocols(spike, {PROTOCOL: {
        "event_times_ms": events,
        "timing_pattern": "two five-spike bursts at 100 Hz",
        "timing_evidence": "constructed_input",
        "timing_source": "Portfolio exploration; burst onsets 0 and 120 ms",
    }})
    target_dir = model_root / "_11_targets/v2"
    custom_targets, _ = steps.build_complete_train_targets(
        custom_inputs,
        pd.read_csv(target_dir / "synthetic_signal_summary_v2.csv"),
        pd.read_csv(target_dir / "synthetic_trial_parameters_v2.csv"),
    )
    # Supply the extra protocol in this process. The single-spike calibration
    # rows remain available for the platform's unchanged device readout gains.
    augmented_inputs = pd.concat([inputs, custom_inputs], ignore_index=True)
    augmented_targets = pd.concat([targets, custom_targets], ignore_index=True)
    ds._v2_inputs = lambda: augmented_inputs
    ds._v2_train_waveforms = lambda: augmented_targets
    try:
        data = export_run(PROTOCOL, "Two bursts of five spikes", "exploration",
            "Constructed input; two five-spike bursts at 100 Hz, starting at 0 and 120 ms", "constructed_input")
    finally:
        ds._v2_inputs = original_inputs
        ds._v2_train_waveforms = original_targets

    return data, events


if __name__ == "__main__":
    main()
