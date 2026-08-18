function applicationEntitlementsObserverForMutation(selector) {
    return new Promise(resolve => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(mutations => {
            if (document.querySelector(selector)) {
                resolve(document.querySelector(selector));
                observer.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}

function applicationEntitlementsExec() {
    applicationEntitlementsObserverForMutation("#appTab").then((elm) => {
		var applicationConfigTabs = Ext.getCmp("appTab");
        if (!applicationConfigTabs) {
            return;
        }

        if (applicationConfigTabs.down("#applicationEntitlementsTabItem")) {
            return;
        }

        //Get the Application ID from the URL...
        var applicationID = applicationEntitlementsGetApplicationID();
        
        //Get the Application Name from the REST API...
        var applicationName = "";

        const requestOptions = {
            method: 'GET',
            headers: {
                'X-XSRF-TOKEN': PluginHelper.getCsrfToken()
            }
        };

        var RESTURLAPPNAME = PluginHelper.getPluginRestUrl("ApplicationEntitlementsPlugin/applicationName?applicationId=" + applicationID);

        fetch(RESTURLAPPNAME, requestOptions).then(response => {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            if (response.status == 200) {
                return response.json();
            }
        }).then(data => {
            var applicationNameFromREST = data;
            if (applicationNameFromREST && applicationNameFromREST.applicationName) {
                applicationName = applicationNameFromREST.applicationName;
            }
        }).catch(error => {
            console.error("Application Name Method - Error:", error);
        });

        //Add the "Entitlements" tab to the application configuration tabs...
        var customEntitlementsTabConfig = {
            itemId: "applicationEntitlementsTabItem",
            title: "Entitlements",
            html: applicationEntitlementsBuildTabHtml(),
            listeners: {
                afterrender: function() {
                    //Get the entitlements for the application and populate the table...
                    applicationEntitlementsLoad_GetAllDetails(applicationID);
                    applicationEntitlementsUpdatePaginationButtons(applicationID);
                    applicationEntitlementEachRowClicks(applicationName);
                    applicationEntitlementsSearch(applicationID);
                    applicationEntitlementsPageInput(applicationID);
                    applicationEntitlementsLimitSelect(applicationID);
                    applicationEntitlementsRefreshButton(applicationID);
                    applicationEntitlementsGetAllEntitlementAttributeTypes(applicationID);
                    applicationEntitlementsEntitlementAttrTypeSelect(applicationID);
                }
            }
        };

        //Find the respective Accounts tab and insert the Entitlements tab after it...
        var accountsTabIndex = -1;
        applicationConfigTabs.items.each(function (tab, index) {
            if (tab.title === "Accounts") {
                accountsTabIndex = index;
                return false;
            }
        });

        //Once the respective tab is found, insert the Entitlements tab after it. If not found, add the Entitlements tab at the end.
        if (accountsTabIndex !== -1) {
            applicationConfigTabs.insert(accountsTabIndex + 1, customEntitlementsTabConfig);
        } else {
            console.warn("Accounts tab not found -- adding Entitlements tab at the end instead.");
            applicationConfigTabs.add(customEntitlementsTabConfig);
        }
    });
}

function applicationEntitlementsGetApplicationID() {
    var appIDFromURL = null;
    try {
        var appURL = new URL(window.location.href);
        if (appURL) {
            appIDFromURL = appURL.searchParams.get("appId");
        }
    } catch (e) {
        console.error("Application ID Error:", e);
    }
    return appIDFromURL;
}

async function applicationEntitlementsLoad_GetAllDetails(applicationID) {
    var errorElmVal = document.getElementById("entitlementsError");
    var emptyElmVal = document.getElementById("entitlementsEmpty");

    //Load the entitlements for the application and populate the table...
    applicationEntitlementsShowLoadingState();

    const requestOptions = {
		method: 'GET',
		headers: {
			'X-XSRF-TOKEN': PluginHelper.getCsrfToken()
		}
	};

    var RESTURL = PluginHelper.getPluginRestUrl("ApplicationEntitlementsPlugin/entitlements?applicationId=" + applicationID + "&start=" + applicationEntitlementsPaginationVars.start + "&limit=" + applicationEntitlementsPaginationVars.limit + "&q=" + encodeURIComponent(applicationEntitlementsPaginationVars.query) + "&attributeType=" + encodeURIComponent(applicationEntitlementsPaginationVars.entitlementAttributeType));

    await fetch(RESTURL, requestOptions).then(response => {
		if (!response.ok) {
			throw new Error("Network response was not ok");
		}
		if (response.status == 200) {
			return response.json();
		}
	}).then(data => {
		var applicationEntitlementsFromREST = data;

        //Construct the HTML table body based on the response data...
        var finalUpdatedBody = "";
        if (applicationEntitlementsFromREST) {
            var entitlementDetailsEntries = Object.values(applicationEntitlementsFromREST.entitlements || {});
            applicationEntitlementsPaginationVars.totalCount = applicationEntitlementsFromREST.totalCount || 0;
            applicationEntitlementsRenderRows(entitlementDetailsEntries);
            applicationEntitlementsUpdatePaginationUI();
        }
        emptyElmVal.style.display = entitlementDetailsEntries.length ? "none" : "block";
        applicationEntitlementsSortHeaders(entitlementDetailsEntries);

        // Update the layout of the tab to ensure proper rendering after content changes
        var myAppTab = Ext.getCmp("appTab");
        if (myAppTab) {
            myAppTab.updateLayout();
        }
	}).catch(error => {
		console.error("Error:", error);
        errorElmVal.innerHTML = "Error fetching entitlements: " + error.message;
        errorElmVal.style.display = "block";
	});
}

function applicationEntitlementsRenderRows(entitlementDetailsEntries) {
    var tbodyVal = document.getElementById("entitlementsTableBody");

    var finalUpdatedBody = "";
    if (entitlementDetailsEntries) {
        entitlementDetailsEntries.forEach(function (attributeValue) {
            //Construct the HyperLink URL for the entitlement value to view the ManagedAttribute Object details...
            var managedAttributeURL = SailPoint.CONTEXT_PATH + "/define/groups/editAccountGroup.jsf?editForm:id=" + attributeValue.managedAttributeID + "&SelectedId=" + attributeValue.managedAttributeID + "&forceLoad=true";            
            finalUpdatedBody += "<tr class=\"appEntitlements-row\">" +
                                "<td><a href=\"" + managedAttributeURL + "\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"unboldFakeLink\"> " + attributeValue.managedAttributeID + "</a></td>" +
                                "<td>" + attributeValue.attributeName + "</td>" +
                                "<td>" + attributeValue.entitlementDisplayName + "</td>" +
                                "<td>" + attributeValue.entitlementValue + "</td>" +
                                "<td>" + attributeValue.entitlementOwner + "</td>" +
                                "<td class=\"appEntitlements-requestable-cell\">" + 
                                    (attributeValue.isRequestable === "true" ? applicationEntitlementsRequestableTrueSvg() : applicationEntitlementsRequestableFalseSvg()) +
                                "</td>" +
                                "</tr>";
        });
    }
    tbodyVal.innerHTML = finalUpdatedBody;

    // Update the layout of the tab to ensure proper rendering after content changes
    var myAppTab = Ext.getCmp("appTab");
    if (myAppTab) {
        myAppTab.updateLayout();
    }
}

function applicationEntitlementsRequestableTrueSvg() {
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\">" +
               "<circle cx=\"12\" cy=\"12\" fill=\"#22C55E\" r=\"12\"/>" +
               "<path d=\"M7 12.5l3.5 3.5 6.5-7\" fill=\"none\" stroke=\"#FFFFFF\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.2\"/>" +
           "</svg>";
}


function applicationEntitlementsRequestableFalseSvg() {
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\">" +
                "<circle cx=\"12\" cy=\"12\" fill=\"#f50808\" r=\"12\"/>" +
                "<line x1=\"15\" y1=\"9\" x2=\"9\" y2=\"15\" stroke=\"#FFFFFF\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"/>" +
                "<line x1=\"9\" y1=\"9\" x2=\"15\" y2=\"15\" stroke=\"#FFFFFF\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"/>" +
            "</svg>";
}

function applicationEntitlementsSortHeaders(entitlementDetailsEntries) {
    var headers = document.querySelectorAll("#entitlementsTable th[data-sort]");

    var applicationEntitlementsSortState = {
        field: null,
        ascending: true
    };

    headers.forEach(function (th) {
        th.addEventListener("click", function () {
            var field = th.getAttribute("data-sort");

            if (applicationEntitlementsSortState.field === field) {
                applicationEntitlementsSortState.ascending = !applicationEntitlementsSortState.ascending;
            } else {
                applicationEntitlementsSortState.field = field;
                applicationEntitlementsSortState.ascending = true;
            }

            var direction = applicationEntitlementsSortState.ascending ? 1 : -1;

            entitlementDetailsEntries.sort(function (a, b) {
                var valA = (a[field] || "").toString().toLowerCase();
                var valB = (b[field] || "").toString().toLowerCase();
                if (valA < valB) {
                    return -1 * direction;
                }
                if (valA > valB) {
                    return 1 * direction;
                }
                return 0;
            });
            applicationEntitlementsRenderRows(entitlementDetailsEntries);
        });
    });
}

function applicationEntitlementsUpdatePaginationUI() {
    var firstBtn = document.getElementById("entitlementsFirst");
    var prevBtn = document.getElementById("entitlementsPrev");
    var nextBtn = document.getElementById("entitlementsNext");
    var lastBtn = document.getElementById("entitlementsLast");
    var pageInputEl = document.getElementById("entitlementsPageInput");
    var pageOfLabelEl = document.getElementById("entitlementsPageOfLabel");
    var totalCountEl = document.getElementById("entitlementsTotalCount");

    var tempVars = applicationEntitlementsPaginationVars;
    var currentPage = Math.floor(tempVars.start / tempVars.limit) + 1;
    var totalPages = Math.max(1, Math.ceil(tempVars.totalCount / tempVars.limit));

    pageInputEl.value = currentPage;
    pageOfLabelEl.textContent = " of " + totalPages;
    totalCountEl.textContent = "Displaying " + Math.min(tempVars.start + tempVars.limit, tempVars.totalCount) + " of " + tempVars.totalCount;

    var atStart = tempVars.start <= 0;
    var atEnd = tempVars.start + tempVars.limit >= tempVars.totalCount;

    firstBtn.disabled = atStart;
    prevBtn.disabled = atStart;
    nextBtn.disabled = atEnd;
    lastBtn.disabled = atEnd;
}

function applicationEntitlementsUpdatePaginationButtons(applicationID) {
    var firstBtn = document.getElementById("entitlementsFirst");
    var prevBtn = document.getElementById("entitlementsPrev");
    var nextBtn = document.getElementById("entitlementsNext");
    var lastBtn = document.getElementById("entitlementsLast");

    var tempVars = applicationEntitlementsPaginationVars;

    firstBtn.addEventListener("click", function () {
        tempVars.start = 0;
        applicationEntitlementsLoad_GetAllDetails(applicationID);
    });

    prevBtn.addEventListener("click", function () {
        tempVars.start = Math.max(0, tempVars.start - tempVars.limit);
        applicationEntitlementsLoad_GetAllDetails(applicationID);
    });

    nextBtn.addEventListener("click", function () {
        var nextStart = tempVars.start + tempVars.limit;
        if (nextStart < applicationEntitlementsPaginationVars.totalCount) {
            applicationEntitlementsPaginationVars.start = nextStart;
            applicationEntitlementsLoad_GetAllDetails(applicationID);
        }
    });

    lastBtn.addEventListener("click", function () {
        var totalPages = Math.max(1, Math.ceil(tempVars.totalCount / tempVars.limit));
        tempVars.start = (totalPages - 1) * tempVars.limit;
        applicationEntitlementsLoad_GetAllDetails(applicationID);
    });
}

function applicationEntitlementEachRowClicks(applicationName) {
    var tbodyVal = document.getElementById("entitlementsTableBody");

    tbodyVal.addEventListener("click", function (event) {
        var eachRow = event.target.closest(".appEntitlements-row");
        if (!eachRow) {
            return;
        }

        // Prevent the click event from triggering when clicking on the first cell (ID column) which contains a hyperlink to the ManagedAttribute details page
        var clickedCell = event.target.closest("td");
        if (clickedCell === eachRow.cells[0]) {
            return;
        }

        var entAttribute = eachRow.cells[1].textContent;
        var entValue = eachRow.cells[3].textContent;

        if (typeof viewAccountGroup === "function") {
            viewAccountGroup(applicationName, entAttribute, entValue, undefined, '', '', '', '');return false;
        } else {
            console.error("viewAccountGroup is not defined on this page.");
        }
    });
}

function applicationEntitlementsSearch(applicationID) {
    var searchInput = document.getElementById("appEntitlementsSearch");
    var searchBtn = document.getElementById("appEntitlementsSearchBtn");
    var clearBtn = document.getElementById("appEntitlementsSearchClearBtn");

    function triggerSearch() {
        applicationEntitlementsPaginationVars.query = searchInput.value.trim();
        applicationEntitlementsPaginationVars.start = 0;
        applicationEntitlementsLoad_GetAllDetails(applicationID);
        clearBtn.style.display = searchInput.value.trim() ? "flex" : "none";
    }

    function clearSearch() {
        searchInput.value = "";
        applicationEntitlementsPaginationVars.query = "";
        applicationEntitlementsPaginationVars.start = 0;
        applicationEntitlementsLoad_GetAllDetails(applicationID);
        clearBtn.style.display = "none";
        searchInput.focus();
    }

    searchBtn.addEventListener("click", triggerSearch);
    clearBtn.addEventListener("click", clearSearch);

    searchInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            triggerSearch();
        }
    });

    searchInput.addEventListener("input", function () {
        clearBtn.style.display = searchInput.value.trim() ? "flex" : "none";
    });
}

function applicationEntitlementsPageInput(applicationID) {
    var pageInputEl = document.getElementById("entitlementsPageInput");

    pageInputEl.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();

            var vars = applicationEntitlementsPaginationVars;
            var totalPages = Math.max(1, Math.ceil(vars.totalCount / vars.limit));

            var requestedPage = parseInt(pageInputEl.value, 10);
            if (isNaN(requestedPage)) {
                requestedPage = 1;
            }
            requestedPage = Math.min(Math.max(1, requestedPage), totalPages);

            vars.start = (requestedPage - 1) * vars.limit;
            applicationEntitlementsLoad_GetAllDetails(applicationID);
        }
    });

    pageInputEl.addEventListener("blur", function () {
        var vars = applicationEntitlementsPaginationVars;
        var currentPage = Math.floor(vars.start / vars.limit) + 1;
        pageInputEl.value = currentPage;
    });
}

function applicationEntitlementsLimitSelect(applicationID) {
    var limitSelect = document.getElementById("entitlementsLimitSelect");

    limitSelect.addEventListener("change", function () {
        var newLimit = parseInt(limitSelect.value, 10);
        if (isNaN(newLimit) || newLimit <= 0) {
            newLimit = 25;
        }
        applicationEntitlementsPaginationVars.limit = newLimit;
        applicationEntitlementsPaginationVars.start = 0;
        applicationEntitlementsLoad_GetAllDetails(applicationID);
    });
}

function applicationEntitlementsRefreshButton(applicationID) {
    var refreshBtn = document.getElementById("entitlementsRefreshBtn");

    refreshBtn.addEventListener("click", function () {
        refreshBtn.classList.add("spinning");
        applicationEntitlementsLoad_GetAllDetails(applicationID).then(function () {
            refreshBtn.classList.remove("spinning");
        });
    });
}

function applicationEntitlementsShowLoadingState() {
    var tbodyVal = document.getElementById("entitlementsTableBody");
    var emptyElmVal = document.getElementById("entitlementsEmpty");
    var errorElmVal = document.getElementById("entitlementsError");

    emptyElmVal.style.display = "none";
    errorElmVal.style.display = "none";

    tbodyVal.innerHTML =
        "<tr class=\"appEntitlements-loading-row\">" +
            "<td colspan=\"6\">" +
                "<div class=\"appEntitlements-loading-content\">" +
                    "<span class=\"appEntitlements-spinner\"></span>" +
                    "<span>Loading entitlements...</span>" +
                "</div>" +
            "</td>" +
        "</tr>";
}

function applicationEntitlementsGetAllEntitlementAttributeTypes(applicationID) {
    var selectEl = document.getElementById("entitlementsAttrTypeSelect");

    const requestOptions = {
        method: 'GET',
        headers: {
            'X-XSRF-TOKEN': PluginHelper.getCsrfToken()
        }
    };

    var RESTAPPENTTYPEURL = PluginHelper.getPluginRestUrl("ApplicationEntitlementsPlugin/entitlementAttributeTypes?applicationId=" + applicationID);

    fetch(RESTAPPENTTYPEURL, requestOptions).then(response => {
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }
        if (response.status == 200) {
			return response.json();
		}
    }).then(data => {
        var entitlementAttributeTypes = (data && data.attributeTypes) || [];
        entitlementAttributeTypes.forEach(function (attrType) {
            var option = document.createElement("option");
            option.value = attrType;
            option.textContent = attrType;
            selectEl.appendChild(option);
        });
    }).catch(function (error) {
        console.error("Failed to load Entitlement Attribute Types:", error);
    });
}

function applicationEntitlementsEntitlementAttrTypeSelect(applicationID) {
    var selectEl = document.getElementById("entitlementsAttrTypeSelect");

    selectEl.addEventListener("change", function () {
        applicationEntitlementsPaginationVars.entitlementAttributeType = selectEl.value;
        applicationEntitlementsPaginationVars.start = 0;
        applicationEntitlementsLoad_GetAllDetails(applicationID);
    });
}

function applicationEntitlementsBuildTabHtml() {
    return "" +
        "<div id=\"entitlementsRoot\" class=\"appEntitlements-root\">" +
            "<div class=\"appEntitlements-toolbar\">" +
                "<div class=\"appEntitlements-search-group\">" +
                    "<input id=\"appEntitlementsSearch\" type=\"text\" placeholder=\"Search entitlements...\"/>" +
                    "<button id=\"appEntitlementsSearchClearBtn\" type=\"button\" class=\"appEntitlements-search-clear-btn\" aria-label=\"Clear search\" style=\"display:none;\">&times;</button>" +
                    "<button id=\"appEntitlementsSearchBtn\" type=\"button\" class=\"appEntitlements-search-btn\" aria-label=\"Search\">" +
                        "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">" +
                            "<circle cx=\"11\" cy=\"11\" r=\"7\"></circle>" +
                            "<line x1=\"21\" y1=\"21\" x2=\"16.65\" y2=\"16.65\"></line>" +
                        "</svg>" +
                    "</button>" +
                "</div>" +
                /*
                "<div class=\"appEntitlements-attrtype-group\">" +
                    "<span class=\"appEntitlements-page-text\">Attribute Type</span>" +
                    "<select id=\"entitlementsAttrTypeSelect\" class=\"appEntitlements-limit-select\">" +
                        "<option value=\"\">All</option>" +
                    "</select>" +
                "</div>" +
                */
               "<span class=\"appEntitlements-page-text\">Attribute Type</span>" +
               "<select id=\"entitlementsAttrTypeSelect\" class=\"appEntitlements-limit-select appEntitlements-attrtype-select\">" +
                    "<option value=\"\">All</option>" +
                "</select>" +
            "</div>" +
            "<div id=\"entitlementsTableWrapper\">" +
                "<table id=\"entitlementsTable\" class=\"appEntitlements-table\">" +
                    "<thead>" +
                        "<tr>" +
                            "<th data-sort=\"managedAttributeID\">ID</th>" +    
                            "<th data-sort=\"attributeName\">Attribute</th>" +
                            "<th data-sort=\"entitlementDisplayName\">Display Name</th>" +
                            "<th data-sort=\"entitlementValue\">Value</th>" +
                            "<th>Owner</th>" +
                            "<th>Requestable</th>" +
                        "</tr>" +
                    "</thead>" +
                    "<tbody id=\"entitlementsTableBody\"></tbody>" +
                "</table>" +
                "<div id=\"entitlementsEmpty\" class=\"appEntitlements-empty\" style=\"display:none;\">" +
                    "No entitlements found for this application." +
                "</div>" +
                "<div id=\"entitlementsError\" class=\"appEntitlements-error\" style=\"display:none;\"></div>" +
            "</div>" +
            "<div id=\"entitlementsPager\" class=\"appEntitlements-pager\">" +
                "<div class=\"appEntitlements-pager-left\">" +                
                    "<div class=\"appEntitlements-pager-controls\">" +
                        "<button id=\"entitlementsFirst\" type=\"button\" title=\"First Page\">&laquo;</button>" +
                        "<button id=\"entitlementsPrev\" type=\"button\" title=\"Previous Page\">&lsaquo;</button>" +
                        "<span class=\"appEntitlements-page-text\">Page</span>" +
                        "<input id=\"entitlementsPageInput\" type=\"text\" class=\"appEntitlements-page-input\" value=\"1\"/>" +
                        "<span id=\"entitlementsPageOfLabel\" class=\"appEntitlements-page-text\">of 1</span>" +
                        "<button id=\"entitlementsNext\" type=\"button\" title=\"Next Page\">&rsaquo;</button>" +
                        "<button id=\"entitlementsLast\" type=\"button\" title=\"Last Page\">&raquo;</button>" +
                    "</div>" +
                    "<button id=\"entitlementsRefreshBtn\" type=\"button\" title=\"Refresh\" class=\"appEntitlements-refresh-btn\" aria-label=\"Refresh\">" +
                        "<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">" +
                            "<polyline points=\"23 4 23 10 17 10\"></polyline>" +
                            "<polyline points=\"1 20 1 14 7 14\"></polyline>" +
                            "<path d=\"M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15\"></path>" +
                        "</svg>" +
                    "</button>" +
                    "<div class=\"appEntitlements-limit-group\">" +
                        "<span class=\"appEntitlements-page-text\">Show</span>" +
                        "<select id=\"entitlementsLimitSelect\" class=\"appEntitlements-limit-select\">" +
                            //"<option value=\"2\" selected>2</option>" +
                            "<option value=\"5\">5</option>" +
                            "<option value=\"10\">10</option>" +
                            "<option value=\"20\">20</option>" +
                            "<option value=\"25\" selected>25</option>" +
                            "<option value=\"50\">50</option>" +
                            "<option value=\"75\">75</option>" +
                            "<option value=\"100\">100</option>" +
                        "</select>" +
                        "<span class=\"appEntitlements-page-text\">items</span>" +
                    "</div>" +
                "</div>" +
                "<span id=\"entitlementsTotalCount\" class=\"appEntitlements-total-count\"></span>" +
            "</div>" +
        "</div>";
}

//Global variables..

//Pagination variables for the entitlements table...
var applicationEntitlementsPaginationVars = {
    start: 0,
    limit: 25,
    totalCount: 0,
    query: "",
    entitlementAttributeType: ""
};
applicationEntitlementsExec();