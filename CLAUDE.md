# Regra fixa: nunca dar push sem OK explícito

Depois de commitar localmente, **pare e avise o que mudou — nunca rode
`git push` (pra branch nenhuma, `main` incluída) sem o dono do projeto
confirmar antes, mensagem por mensagem, mesmo que ele tenha aprovado um
push antes na mesma sessão.** Push pra `main` em particular dispara
deploy de produção de verdade (CI builda e publica) — trata como a ação
mais sensível que existe neste repo, nunca como rotina.

Commitar localmente sem pedir OK continua normal. O que precisa de sinal
verde é especificamente `git push`/`git push origin`/`git push xanthus`
(e o merge pra `main` que normalmente antecede esse push).

@AGENTS.md
@PROJECT-CONTEXT.md
@SOCIAL-CONTEXT.md
