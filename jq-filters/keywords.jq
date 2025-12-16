with_entries(
	select(.value.visibility == "public") 
	| ( .value |= {} ) 
)