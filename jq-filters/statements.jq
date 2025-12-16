with_entries(
	select(.value.visibility == "public" and .key != "index")
	| .value = {}
)
