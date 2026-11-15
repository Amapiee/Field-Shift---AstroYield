# Crop ranking score

The crop table uses `seasonal_crop_fit_v2_peaked` in both `/api/crop_suitability`
and `/api/analyze`. It ranks each crop's best growing window in descending order
of `raw_score_pct`; ties use the crop key for a stable order. Display uses one
decimal place and the existing 1% minimum for very low scores.

The existing crop limits and weighted climate formula are retained. For this
table, temperature, rainfall and soil moisture membership now peak at the
midpoint of each optimal interval. With normalized offset `z` from that midpoint
(-1 to 1), membership is `1 - 0.1*z*z`. Optimal interval edges have membership
0.9, and linear shoulders fall to zero at the model limits. This is continuous
at the joins. The 0.9 edge weight and midpoint preference are explicit project
heuristics, not agronomically calibrated thresholds.

The climate score retains surface heat and cold-risk penalties. The response
includes `score_components` for inspecting climate fit and the cold multiplier.
External annual suitability scores no longer multiply the table's climate score
by up to two and clip different results to 100%. The rotation optimizer retains
its existing scoring and external data inputs; this refinement concerns the
crop recommendation table.

100% is still possible at the modeled optimum, and equal scores remain possible.
There is no artificial cap or forced spacing between crops. Missing required
climate data produces no ranking. Growing windows can cross the year boundary;
the existing cold-risk rules and three-/four-month windows are retained.
