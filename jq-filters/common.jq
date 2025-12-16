def intersect($x; $y):
	[ $x[] | select($y[] == .) ];

# Specific yet common frontmatter helpers
def stringArrayToYaml:
     "\n  - " + (. | join("\n  - "))
;
def objArrayToYaml:
    map(
        "\n  - " +
        (
            .
            | to_entries
            | map("\(.key | tostring): \(.value | tostring)")
            | join("\n    ")
        )
    ) | join("")
;

# Args: array of subroutines
# Filter out any internal or unrecognised subroutines
def validateSubroutines:
    if contains(["all"])
    then ["all"]
    else (
        if contains(["all-but-log"])
        then ($subroutines - ["log"])
        else (
            if contains(["edge_node"])
            then intersect(
                $subroutines;
                [ "recv", "prehash", "hash", "predeliver", "deliver", "log" ]
            )
            else map(
                select(
                    . as $el
                    | ($subroutines | contains([$el]))
                )
            )
            end
        )
        end
    )
    end
;

# Args: type (string)
# Default any internal or unrecognised type to STRING
def validType:
    tostring
    | . as $t
    | (
        if (
            ($types + ["ID", "VOID"])
            | contains([$t])
        )
        then $t

        # https://github.com/fastly/Varnish/pull/4600
        # See also https://github.com/fastly/Varnish/blob/f6004c1f37ce/src/vcc/code_generation/vcl_functions.json
        elif (
            $t | test("^INTEGER_*")
        ) 
        then "INTEGER"
                
        elif (
            $t | test("^ID_*")
        ) 
        then "ID"

        elif (
            $t | test("^TIME_*")
        ) 
        then "TIME"

        else "STRING"
        end
    )
;

# Args: argsArray ({ type, name })
# Default any internal or unrecognised type to STRING
def validateTypes:
    map(.type |= (. | validType))
;
