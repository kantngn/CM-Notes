

//////// AUTOMATION ////////////
IR report regex improvement


///// CLIENT NOTES ////////



//////// Taskbar /////////



/////// FO / DDS Contact Window /////////

FO/DDS contact - can resize pass the forms elements. 


/////// MED PROV & DRUGS PANEL /////// 
Editable Med condition view .
Add looking glass to each drug entry 
Add DB for common drugs lookup
Add API to lookup and ADD TO DB 



////// SHORTCUTS //////



//// PROBLEM //// 
I've hit a snag. It seems there's a naming inconsistency; PdfManager.js defines the PDF fetching function as PdfManager.fetchPdfBytes, but another module, FeaturePanels.js, attempts to access it as app.Core.fetchPdfBytes. This looks like a potential integration issue. I'm focusing on line 29 of PdfManager.js to get more context.

Clarifying Dependencies

It appears FeaturePanels.js does indeed list PdfManager.js as a dependency. I've re-examined the code and suspect a potential oversight in the integration. Line 157 in FeaturePanels.js explicitly checks app.Core.fetchPdfBytes, which doesn't align with how PdfManager.js exposes the function as app.Core.PdfManager.fetchPdfBytes. Perhaps a past refactor created an unintended discrepancy, and an update is needed in FeaturePanels.js.


///// 
