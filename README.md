# utils

Contain common scripts and workflows

# Workflows

## Canvas integrering

I [.github/workflows](https://github.com/bth-python/python-abcd25/blob/main/.github/workflows/) finns det ett antal workflows för att hantera integrering mot Canvas när studenterna lämnar in uppgifter med PRs.

För att köra dess workflows måste det finnas ett [workflow i studenterna repository](https://github.com/bth-python/python-abcd25/blob/main/.github/workflows/main.yml). Det innehåller alla olika sätt som startar mina workflows och skickar med alla data som behövs för övriga workflows (GitHub är lite konstigt med vilken data som automatiskt finns i workflows och vilken man måste skicka med manuellt.). [decider.yml](https://github.com/bth-python/utils/blob/main/.github/workflows/decider.yml) startas och kollar vad som startade studentens workflow. Baserat på vilket event som startade det, anropas de olika workflows som finns.

Det enda studenterna behöver för att allt ska fungera är det [workflow som startar allt](https://github.com/bth-python/python-abcd25/blob/main/.github/workflows/main.yml). Det innehåller minimalt med kod för att undvika att vi behöver uppdatera koden. De behöver också skapa en variabel i sitt repo. Det beskrivs längre ner.

`examiner.yml` innehåller en del kod som är kursspecifikt, övriga workflows kan användas rakt av i andra kurser.

### Setup

För att köra integrering mot Canvas måste det finnas lite data på GitHub.

#### teams

- `teacher`- Ett team i organisationen. Där ska alla användare ligga som har rätt att merga en students PR och på så sätt ge `G` som betyg.

#### Organisations hemligheter

- `CANVAS_API_TOKEN`: för att updpatera canvas
- `READ_ORG_TOKEN`: en PAT som har rättigheter att läsa vilka teams som finns i organisationen.

#### Organisations variabler:

- `COURSE_ID`: canvas kurs id
- `ASSIGNMENTS`: ett objekt som kopplar branch namn till canvas assignment ids. t.e.x
  ```
  {
  "bth/submit/kmom03": 56061,
  "bth/submit/kmom06": 56062,
  "bth/submit/kmom10": 56064
  }
  ```

#### Student repository variabler

- `STUDENT_CANVAS_ID` - studentens id på Canvas. En sifferkod. [Guide åt studenter för att lägga till](https://bth-python.github.io/website/laromaterial/kursrepo/lagg-till-studentid/).

### examiner.yml

När en student öppnar en ny PR körs detta workflow. Den gör tre saker.

1. Skapar en inlämning på Canvas åt studenten. Inlämningen på Canvas innehåller kommentaren och titeln som studenten använder för att skapa PRn. Det skickas också med en länk till PRn.
2. För det kmom som man gör inlämningen på och alla föregående kmoms exekveras labbarna, validering och testerna på uppgifterna. T.ex. om de gör inlämning på kmom03 så körs alla för kmom01, kmom02 och kmom03.
3. Resultatet av alla tester och validering används för att betygsätta inlämningen som skapades (1). Om allt passerade sätts betyg `PG`. Om något gick fel sätts betyg `Ux`. I kommentaren står det om allt gick bra eller om något gick fel. Det finns också en länk till workflow jobbet på Github så studenten kan kolla vad som gick fel.

Detta workflow är minst generell. Steg 2 har mycket kurs specifikt men steg 1 och 3 kan återanvändas för andra kurser om man ändrar på steg 2.

#### Setup

För att kunna veta vilka kmoms och i vilka mappar som uppgifterna ligger i för varje inlämning behövs en variabel med denna koppling.

##### Organisations variabel

- `KMOM_PATHS`: Vilka mappar som ska testas för en inlämning. T.ex.
  ```
    {
    "bth/submit/kmom03": {
        "labs": ["src/kmom01/lab_01", "src/kmom02/lab_02", "src/kmom03/lab_03"],
        "kmoms": ["tests/kmom01/convert", "tests/kmom02/convert", "tests/kmom03/convert"]
    },
    "bth/submit/kmom06": {
        "labs": ["src/kmom04/lab_04", "src/kmom05/lab_05", "src/kmom06/lab_06"],
        "kmoms": ["tests/kmom04/convert", "tests/kmom05/convert", "tests/kmom06/convert"]
    },
    "bth/submit/kmom10": {
        "labs": [],
        "kmoms": ["tests/kmom10/convert"]
    }
    }
  ```

### need_fix.yml

När en lärare gör en code review på PRn så skickas det till Canvas. Slutkommentaren som läraren gör hela reviewn används som kommentar på canvas. Det skickas också med en länk till reviewn. Betyg `Ux` sätts på inlämningen.

### on_merge.yml

När en lärare ska ge en ge en student godkänt på en uppgift måste läraren göra en code review och välja att den `approve` koden. Efter det ska läraren klicka "merge PR".

När läraren gör merge körs detta workflow. Först görs en koll att användaren som mergade finns med i teamet `teachers`. Om användaren inte gör det sätts betyg `Ux`. Om användaren finns i teamet sätts betyg `G`. Kommentaren som läraren skrev när den gjorde code reviewn används som kommentar på Canvas rättningen.
