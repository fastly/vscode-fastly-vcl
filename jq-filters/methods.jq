with_entries(
	select(.value.visibility == "public") 
	| del(.value.visibility) 
)