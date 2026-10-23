# Enhancer models head to head (new prompt)

30 blind 3-way rankings (opus judge).

| model | 1st | 2nd | 3rd | mean rank |
| --- | --- | --- | --- | --- |
| haiku | 4 | 12 | 14 | 2.33 |
| sonnet | 15 | 9 | 6 | 1.70 |
| opus | 11 | 9 | 10 | 1.97 |

| case | 1st per sample |
| --- | --- |
| typo | haiku, opus, opus |
| linux-tests | sonnet, sonnet, sonnet |
| it-ref | sonnet, sonnet, sonnet |
| pasted-error | opus, opus, haiku |
| dark-mode | opus, sonnet, sonnet |
| method-given | opus, sonnet, sonnet |
| perf | sonnet, opus, sonnet |
| investigate | opus, opus, sonnet |
| new-mod | opus, sonnet, haiku |
| docs | sonnet, opus, haiku |