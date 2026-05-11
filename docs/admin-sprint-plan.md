# Admin Dashboard — Sprintplan

## Sprint 1: Launch-kritiek
**Doel:** Alles wat nodig is om legaal en professioneel live te gaan.

1. **Factuurgegevens bij betaling**
   - Organisatie-instellingen: bedrijfsnaam, adres, postcode, plaats, KVK-nummer, BTW-nummer
   - Factuurgegevens formulier op `/settings` (beheerder)
   - Factuurgegevens meesturen bij betaling (opslaan in payments tabel)

2. **Factuur-PDF generatie**
   - Factuurnummer-systeem (PJS-2026-0001 oplopend)
   - PDF generatie met jsPDF: logo, factuurgegevens, regels, BTW, totaal
   - Factuur automatisch mailen na betaling (via Resend)
   - Factuur downloadbaar vanuit admin + vanuit gebruikersinstellingen

3. **Handmatig betaling als betaald markeren**
   - Admin kan payment status wijzigen (pending → paid)
   - Bij markeren als betaald: plan activeren (zelfde flow als webhook)
   - Use case: bankoverschrijving ontvangen, handmatig activeren

4. **Superadmin flag toggle**
   - Admin kan gebruiker tot superadmin maken/ontnemen via users-pagina

## Sprint 2: Beheer verbeteren
**Doel:** Efficiënt dagelijks beheer mogelijk maken.

5. **Lid toevoegen aan org (UI)**
   - Knop "Lid toevoegen" in org-detailpaneel
   - Zoek gebruiker op email, selecteer rol
   - API bestaat al (`add-member`)

6. **Lid-rol wijzigen**
   - Dropdown in leden-tabel: lid ↔ beheerder
   - Nieuw API action: `update-member-role`

7. **Gebruiker naam/email wijzigen**
   - Inline bewerken in user-detailpaneel
   - Nieuw API action: `update-user`

8. **Coupon bewerken**
   - Edit-modal voor bestaande coupon (code, bedrag, max uses, verloopdatum)
   - Nieuw API action: `update`

9. **Betaling status handmatig wijzigen**
   - Dropdown in betalingen: pending/paid/canceled/refunded
   - Bij wijziging naar "paid": plan activeren
   - Bij wijziging naar "refunded": plan bevriezen

10. **Configs/plannen van org bekijken**
    - Uitklapbaar in org-detailpaneel
    - Lijst van configs + plannen met naam, datum, grootte

## Sprint 3: Inzicht en gemak
**Doel:** Data-inzicht en productiviteitstools.

11. **Revenue rapportage**
    - Omzet per maand/kwartaal grafiek op dashboard
    - Verdeling Pro Event vs Pro Jaar
    - Coupon-impact (korting gegeven vs omzet)

12. **User impersonation**
    - "Inloggen als" knop op user-detailpaneel
    - Aparte sessie met banner "Je bent ingelogd als [naam]"
    - Terug-knop naar admin

13. **Bulk operaties**
    - Selecteer meerdere gebruikers/orgs
    - Bulk verwijderen, bulk email verificatie, bulk plan wijzigen

14. **Export admin data**
    - CSV export van gebruikers, orgs, betalingen, coupons
    - Filterbare export (datum, status, plan)

15. **Geavanceerd zoeken**
    - Zoeken over alle entiteiten tegelijk
    - Filteren op plan, status, datum, activiteit
