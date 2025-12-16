{
	name: .data.name,
	desc: .data.short_desc,
	visibility: .data.visibility,
	deprecated: .data.deprecated,
	available: (
			(.data.fastly_writes // []) + 
			(.data.fastly_reads // []) 
		) 
		| unique 
		| map(
			if . == "requests" 
			then ["req"] 
			else ["resp"] 
			end
		) 
		| flatten,
}