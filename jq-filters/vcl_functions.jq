import "common" as Common;

with_entries(
	select(.value.visibility == "public") 
	| del(.value.visibility) 
	| del(.value.emitter) 
	| del(.value.checker) 
	| del(.value["side-effects"])
	| (.value.args |= Common::validateTypes)
)
