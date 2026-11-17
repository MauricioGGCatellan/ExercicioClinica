Desafio técnico relacionado a uma clínica, com funcionalidades de cadastrar agendamentos e laudos.

# 1. Instruções para instalar e executar.
Primeiramente, é necessário ter o Docker instalado. Para ver como instalar para seu sistema, acesse: https://www.docker.com/get-started/

Então, execute no terminal, no diretório raiz deste projeto:

```
docker compose up --build -d
```

Se houver algum problema e precisar reiniciar a instalação, execute:

```
docker compose down -v
```

e depois execute novamente:

```
docker compose up --build -d
```

O banco, bem como os dados fictícios necessários, são carregados automaticamente em um contêiner próprio, já no comando acima.

# 2. Credenciais das contas de demonstração.

Para acessar como paciente, use:
Usuário: paciente@teste.com
Senha: Paciente123!

Para acessar como equipe da clínica, use:
Usuário: profissional@teste.com
Senha: Profissional123!

# 3. Instruções para executar os testes.
Execute, na pasta raiz a instalação dos pacotes necessários, e do navegador Chromium, utilizado pelo framework de testes Playwright:

```
npm install
npx playwright install chromium
```

Em ambientes Linux, pode ser necessário instalar dependências adicionais:

```
npx playwright install --with-deps chromium
```

Então, execute, ainda na pasta raiz:

```
npm run test:e2e:headed
```
O resultado será aberto automaticamente no navegador padrão.

# 4. Arquivo de exemplo das variáveis de ambiente, sem segredos reais.

Para baixar o .env referente ao diretório "back", acesse: https://drive.google.com/drive/u/0/folders/1OBaCFlSXmahXq_PFLfTATSNUgKWebxeA

Para baixar o .env referente à raiz do projeto, acesse: https://drive.google.com/drive/u/0/folders/1DMzyYEvEMb6BrsOO7GqlqALUZ47QIto_

Não são utilizadas variáveis de ambiente no diretório "front".

# 5. Decisões técnicas, limitações e pendências.

Para o design da tela, utilizei a cor verde por trazer a sensação de paz, necessária para a situação de vida dos pacientes. Acrescentei um botão de acessibilidade, para que o site possa ser utilizado por mais pessoas.

Quanto aos agendamentos, decidi manter disponível os agendamentos que já passaram (que foram cadastrados quando aquele dia era futuro). É útil para fim de consulta, e para verificar se o laudo referente já está disponível.

Quanto a limitações, destaco que não uso banco exclusivo de testes para os testes automatizados, pois o framework Playwright permitiu adicionar e remover um dado mockado no banco com segurança.

Outra limitação é que as mensagens da API vêm em inglês, o que é ambíguo com a proposta do site, que é ser em português.

Por fim, noto inconsistências no visual da página de login com o restante do site. Isso ficaria como pendência a ser arrumada.

# 6. Tempo aproximado dedicado ao exercício.
5h30min na segunda-feira 16/11; 4h30min na terça-feira 17/11 (tempo não sequencial). 
