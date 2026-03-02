

//////// AUTOMATION ////////////
IR report does not catch AR Barcode - 
  
Eg: Claimant Information Request # 1:
    Letter Name: Appointed Representative Barcode,
    Date Sent: 12/11/2025,

IR report list all date, even if it's the same - Regex to only 1 
Replace One medical record with A/An


///// CLIENT NOTES ////////
Add Richtext format and Inline format bar

HTML Structure
<div class="sn-gnotes-inline-bar" id="formatToolbar">
    <button class="sn-gnotes-inline-btn" title="Bold">B</button>
    <button class="sn-gnotes-inline-btn" title="Italic">I</button>
    
    <div class="sn-gnotes-inline-sep"></div>
    
    <div class="sn-gnotes-dropdown-container">
        <button class="sn-gnotes-inline-btn" title="Header">H</button>
        <div class="sn-gnotes-dropdown-menu">
            <button class="sn-gnotes-inline-btn" style="width: auto; padding: 0 8px;">H2</button>
            <button class="sn-gnotes-inline-btn" style="width: auto; padding: 0 8px;">H3</button>
        </div>
    </div>
    
    <button class="sn-gnotes-inline-btn" title="Bullet List">•</button>
    <button class="sn-gnotes-inline-btn" title="Quote">"</button>
    
    <div class="sn-gnotes-inline-sep"></div>
    
    <button class="sn-gnotes-inline-btn" title="Text Color">A</button>
    <button class="sn-gnotes-inline-btn" title="Highlight Color">✎</button>
    <button class="sn-gnotes-inline-btn" title="Clear Formatting">⊘</button>
</div>

CSS 
/* ── Dropdown Container (For Headers & Colors) ── */
.sn-gnotes-dropdown-container {
    position: relative;
    display: inline-flex;
}

/* ── The Dropdown Menu Itself ── */
.sn-gnotes-dropdown-menu {
    display: none; /* Toggled to flex by JavaScript */
    position: absolute;
    bottom: calc(100% + 10px); /* Popped up right above the button */
    left: 50%;
    transform: translateX(-50%);
    background: #262625; /* Matches toolbar */
    border-radius: 6px;
    padding: 4px;
    gap: 2px;
    flex-direction: column; /* Stacks H2 and H3 vertically */
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    z-index: 100003;
}

/* Small triangle for the dropdown menus to point down at the toolbar button */
.sn-gnotes-dropdown-menu::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-width: 5px;
    border-style: solid;
    border-color: #262625 transparent transparent transparent;
}



//////// Taskbar /////////



/////// FO / DDS Contact Window /////////

FO/DDS contact - can resize pass the forms elements. 


/////// MED PROV & DRUGS PANEL /////// 
Editable Med condition view .
Add looking glass to each drug entry 
Add DB for common drugs lookup
Add API to lookup and ADD TO DB 



////// SHORTCUTS //////
Review keyboard shortcut 

Alt + ` will open Global Note 
Alt + 1 - Client Note 
Alt + 2 - Med Window 
Alt + 3 - Medication Panel 
Alt + 4 - Fax Form 
Alt + 5 - IR Tool 

Alt+Q - info panel 
Alt+W - SSA Panel 
Alt+F -  Fetch  - May be this will conflict with Chrome shortcut, add Alt + E to this too. 
Alt+A - Mail Resolver 
Alt + S - SSD Form Viewer
Alt + M - Scheduler 
Alt + T - Dashboard 
