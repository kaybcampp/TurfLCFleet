// 🔑 OAuth 2.0 Credentials
const CLIENT_ID = "972791277127-g4e3uomcs6diaqdsi1sq7krdclks7mbl.apps.googleusercontent.com";
const API_KEY = "AIzaSyDVwNNqgEUsxVQtW1vOIoOBhDJ57cVzM6o";
const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

// 📊 Google Sheets Configuration
const SHEET_ID = "1uKoi8fGurno_MFjUTghQtr18QThUIhVQMycoAuXSAJE";
const RANGE = "Sheet1!A1:Z"; // Full Range for Fetching Data

async function initClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
    });
    console.log("✅ Google Sheets API Initialized");

    loadTruckLog(); // ✅ Now safe to call after API initializes
}

// 🔥 Ensure Google API fully loads before calling `initClient()`
function loadGoogleAPI() {
    gapi.load("client", initClient);
}

// 🔍 Function to Retrieve VIN from URL
function getVIN() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("vin");
}

async function loadTruckLog() {
    const vin = getVIN();
    if (!vin) {
        document.querySelector(".log-container").innerHTML = "<p>🚫 Error: No truck VIN provided.</p>";
        return;
    }

    const normalizedVIN = vin.trim().toUpperCase();
    console.log("🚗 Fetching truck details from Google Sheets...");

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: RANGE,
        });

        const data = response.result.values;
        if (!data || data.length < 2) {
            console.log("🚫 No truck data found in Sheets.");
            return;
        }

        let sheetData = null;

        // Step 1: Get the truck details from Google Sheets
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (row.length < 10) continue;

            const vinData = row[9];
            if (vinData.trim().toUpperCase() === normalizedVIN) {
                console.log("✅ VIN Matched!");

                sheetData = {
                    truckTitle: `${row[0]} ${row[1]} ${row[3]}`,
                    color: row[5] || "N/A",
                    mileage: row[6] || "N/A",
                    engine: row[7] || "N/A",
                    fuel: row[8] || "N/A",
                    vin: vinData,
                    title: row[10] || "N/A",
                    plate: row[11] || "N/A",
                    regExp: row[12] || "N/A",
                    insExp: row[13] || "N/A",
                    inspExp: row[14] || "N/A",
                    notes: row[15] ? row[15].split(";") : [],
                    status: sessionStorage.getItem(`status_${normalizedVIN}`) || "In Operation"
                };
                break;
            }
        }

        if (!sheetData) {
            console.log("🚫 No matching VIN found.");
            return;
        }

        // Step 2: Check for updates in Supabase (truck_edits table)
        const { data: truckEdits, error } = await supabase
            .from('truck_edits')
            .select('*')
            .eq('vin', normalizedVIN)
            .single(); // Assuming one record per truck

        if (error) {
            console.error("❌ Error fetching truck details from Supabase:", error);
        }

        if (truckEdits) {
            // Override sheet data with truck_edits data if it exists
            sheetData.mileage = truckEdits.mileage || sheetData.mileage;
            sheetData.engine = truckEdits.engine || sheetData.engine;
            sheetData.fuel = truckEdits.fuel || sheetData.fuel;
            sheetData.title = truckEdits.title || sheetData.title;
            sheetData.plate = truckEdits.plate || sheetData.plate;
            sheetData.regExp = truckEdits.regExp || sheetData.regExp;
            sheetData.insExp = truckEdits.insExp || sheetData.insExp;
            sheetData.inspExp = truckEdits.inspExp || sheetData.inspExp;
            sheetData.status = truckEdits.status || sheetData.status;  // Ensure status is updated from Supabase
        }

        // Update sessionStorage after fetching the updated status
        sessionStorage.setItem(`status_${normalizedVIN}`, sheetData.status);

        // Step 3: Display truck data (either from Sheets or Supabase)
        displayTruckData(sheetData); // Ensure the truck details are correctly displayed with updated status

        // Step 4: Process notes from Sheets and logs from Supabase
        const sheetNotes = (sheetData.notes || []).map(note => ({
            vin: sheetData.vin,
            list_type: "notes",
            entry_text: note,
            created_at: "2000-01-01T00:00:00Z", // Placeholder timestamp
            file_url: null,
            file_name: null
        }));

        // Step 5: Fetch logs from Supabase (truck_logs)
        const { data: supabaseLogs, error: logError } = await supabase
            .from('truck_logs')
            .select('*')
            .ilike('vin', normalizedVIN)
            .order('created_at', { ascending: true });

        if (logError) {
            console.error("❌ Error loading logs from Supabase:", logError);
            return;
        }

        console.log("🧾 Supabase Logs:", supabaseLogs);
        console.log("📄 Sheet Notes:", sheetNotes);

        const allLogs = [...sheetNotes, ...supabaseLogs];
        console.log("📋 Combined All Logs:", allLogs);

        const maintenanceList = allLogs.filter(e => (e.list_type || "").trim().toLowerCase() === "maintenance");
        const repairsList = allLogs.filter(e => (e.list_type || "").trim().toLowerCase() === "repairs");
        const notesList = allLogs
            .filter(e => (e.list_type || "").trim().toLowerCase() === "notes")
            .sort((a, b) => new Date(a.created_at || "2000-01-01") - new Date(b.created_at || "2000-01-01"));

        console.log("🛠️ Maintenance List:", maintenanceList);
        console.log("🔧 Repairs List:", repairsList);
        console.log("📝 Notes List:", notesList);

        // Step 6: Populate lists with logs (important for deletion)
        populateList("maintenanceList", maintenanceList);
        populateList("repairsList", repairsList);
        populateList("notesList", notesList);

    } catch (error) {
        console.error("❌ Error fetching truck details from Google Sheets:", error);
    }
}

function displayTruckData(data) {
    document.getElementById("truckTitle").textContent = data.truckTitle;

    // Updating the truck details section with the data
    document.getElementById("truckDetails").innerHTML = `
    <p><strong>Mileage:</strong> ${data.mileage} miles</p>
    <p><strong>Color:</strong> ${data.color}</p>
    <p><strong>Engine Type:</strong> ${data.engine}</p>
    <p><strong>Fuel Type:</strong> ${data.fuel}</p>
    <p><strong>VIN:</strong> ${data.vin}</p>
    <p><strong>Title #:</strong> ${data.title}</p>
    <p><strong>Plate #:</strong> ${data.plate}</p>
    <p><strong>Registration Exp:</strong> ${data.regExp}</p>
    <p><strong>Insurance Exp:</strong> ${data.insExp}</p>
    <p><strong>Inspection Exp:</strong> ${data.inspExp}</p>
    <p><strong>Status:</strong>
        <span id="truckStatus" class="status ${data.status === 'In Operation' ? 'in-operation' : 'out-of-service'}">
            ${data.status}
        </span>
    </p>
    `;

    // Optional: Adding additional logic to handle specific UI changes if needed (like showing warnings for expired insurance)
    if (data.insExp && new Date(data.insExp) < new Date()) {
        document.getElementById("truckStatus").classList.add("expired-insurance");
    }
}

async function saveEdits() {
    const vin = getVIN();
    const mileage = document.getElementById("editMileage").value.trim();
    const engine = document.getElementById("editEngine").value.trim();
    const fuel = document.getElementById("editFuel").value.trim();
    const title = document.getElementById("editTitle").value.trim();
    const plate = document.getElementById("editPlate").value.trim();
    const regExp = document.getElementById("editRegExp").value.trim();  // Corrected variable name
    const insExp = document.getElementById("editInsExp").value.trim();
    const inspExp = document.getElementById("editInspExp").value.trim();
    const status = document.getElementById("editStatus").value.trim();

    // Validate that all fields are filled out
    if (!mileage || !engine || !fuel || !title || !plate || !regExp || !insExp || !inspExp || !status) {
        alert("❌ All fields must be filled out.");
        return;
    }

    const truckDetails = {
        vin,
        mileage,
        engine,
        fuel,
        title,
        plate,
        regExp,  // Corrected variable name
        insExp,
        inspExp,
        status
    };

    try {
        // Step 1: Use `upsert` to insert or update the truck details in Supabase
        const { error } = await supabase
            .from('truck_edits')
            .upsert([{
                vin: truckDetails.vin,
                mileage: truckDetails.mileage,
                engine: truckDetails.engine,
                fuel: truckDetails.fuel,
                title: truckDetails.title,
                plate: truckDetails.plate,
                regExp: truckDetails.regExp,  // Corrected variable name
                insExp: truckDetails.insExp,
                inspExp: truckDetails.inspExp,
                status: truckDetails.status
            }]);

        if (error) {
            console.error("❌ Error saving truck details:", error.message);
            return;
        }

        console.log("✅ Truck details saved successfully.");
        showSuccessMessage("✅ Changes saved successfully!");

        // Step 2: Update sessionStorage for status
        sessionStorage.setItem(`status_${vin}`, truckDetails.status);

        // Step 3: Update status in the UI immediately (without waiting for reload)
        document.getElementById("truckStatus").textContent = truckDetails.status;
        document.getElementById("truckStatus").className = `status ${truckDetails.status === 'In Operation' ? 'in-operation' : 'out-of-service'}`;

        // Step 4: Reload truck log to reflect the changes (reload entire truck log after saving)
        await loadTruckLog();

    } catch (error) {
        console.error("❌ Error saving truck details:", error);
    }

    // Close the modal after saving
    closeEditForm();
}

async function addEntry(listId, inputId, fileInputId = null) {
    const input = document.getElementById(inputId);
    const text = input.value.trim();
    if (!text) return;

    const vin = getVIN().trim().toLowerCase(); // Normalize VIN
    const timestamp = new Date().toISOString(); // Generate timestamp

    let fileUrl = null;
    let fileName = null;

    // ✅ Handle file upload to Supabase Storage (if file selected)
    if (fileInputId) {
        const fileInput = document.getElementById(fileInputId);
        const file = fileInput?.files?.[0];

        if (file) {
            const filePath = `${vin}/${Date.now()}_${file.name}`;

            const { data, error } = await supabase.storage
                .from('truck-files')
                .upload(filePath, file);

            if (error) {
                console.error("❌ File upload error:", error.message);
            } else {
                const { publicUrl } = supabase.storage.from('truck-files').getPublicUrl(filePath);
                fileUrl = publicUrl;
                fileName = file.name;
            }

            // 🧼 Clear file input and preview display
            fileInput.value = "";
            const previewId = fileInputId.replace("File", "Preview");
            const previewContainer = document.getElementById(previewId);
            if (previewContainer) previewContainer.innerHTML = "";
        }
    }

    // ✅ Save the log entry in Supabase
    const { error: logError } = await supabase.from('truck_logs').insert([{
        vin: vin,
        list_type: listId.replace("List", "").toLowerCase(),
        entry_text: text,
        created_at: timestamp, // Save the timestamp
        file_url: fileUrl,
        file_name: fileName
    }]);

    if (logError) {
        console.error("❌ Supabase log insert error:", logError.message);
        return;
    }

    console.log("✅ Entry saved to Supabase:", text);
    showSuccessMessage("✅ Entry added!");

    // 🧹 Clear input and refresh logs
    input.value = "";
    await loadTruckLog();
}

async function loadLogsFromSupabase(vinRaw) {
    const vin = vinRaw.trim().toLowerCase(); // ✅ Normalize for consistent matching

    const { data: logs, error } = await supabase
        .from('truck_logs')
        .select('*')
        .ilike('vin', vin) // ✅ Case-insensitive match
        .order('created_at', { ascending: true });

    if (error) {
        console.error("❌ Error loading logs from Supabase:", error.message);
        return;
    }

    if (!logs || logs.length === 0) {
        console.log(`ℹ️ No Supabase logs found for VIN: ${vin}`);
    } else {
        console.log(`📦 Loaded ${logs.length} Supabase logs for VIN: ${vin}`);
    }

    const maintenanceList = logs.filter(e => (e.list_type || "").trim().toLowerCase() === "maintenance");
    const repairsList = logs.filter(e => (e.list_type || "").trim().toLowerCase() === "repairs");
    const notesList = logs.filter(e => (e.list_type || "").trim().toLowerCase() === "notes");

    console.log("🛠️ Maintenance Logs:", maintenanceList.length);
    console.log("🔧 Repairs Logs:", repairsList.length);
    console.log("📝 Notes Logs:", notesList.length);

    populateList("maintenanceList", maintenanceList);
    populateList("repairsList", repairsList);
    populateList("notesList", notesList);
}

function createListItem(text, listId, vin, index, fileData = null, id = null, timestamp = null) {
    const listItem = document.createElement("li");
    listItem.setAttribute("data-index", index);
    listItem.setAttribute("data-entry", text);
    listItem.setAttribute("data-id", id); // Add the row ID as a data attribute

    // 🔹 Entry row (text + delete)
    const entryRow = document.createElement("div");
    entryRow.className = "entry-row";

    const entryText = document.createElement("span");
    entryText.className = "entry-text";
    entryText.textContent = text;

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "❌";
    deleteButton.className = "delete-btn";
    deleteButton.onclick = async function () {
        await deleteEntry(listId, index, id); // Pass the row ID to delete
    };

    entryRow.appendChild(entryText);
    entryRow.appendChild(deleteButton);
    listItem.appendChild(entryRow);

    // 🔹 Display timestamp
    if (timestamp) {
        const timestampSpan = document.createElement("span");
        timestampSpan.className = "timestamp";
        timestampSpan.textContent = `📅 ${new Date(timestamp).toLocaleString()}`;
        listItem.appendChild(timestampSpan);
    }

    // 🔹 Optional file preview/download link
    if (fileData && fileData.file_url && fileData.file_name) {
        const fileLink = document.createElement("a");
        fileLink.href = fileData.file_url;
        fileLink.target = "_blank";
        fileLink.textContent = `📎 ${fileData.file_name}`;
        fileLink.className = "file-link";
        listItem.appendChild(fileLink);
    }

    return listItem;
}

function populateList(listId, items) {
    const list = document.getElementById(listId);
    list.innerHTML = ""; // Clear current list

    const vin = getVIN();

    if (!items || !Array.isArray(items) || items.length === 0) {
        console.log(`ℹ️ No items for ${listId}`);
        list.innerHTML = "<p>No entries available.</p>";
        return;
    }

    items.forEach((entry, index) => {
        const fileData = (entry.file_url && entry.file_name) ? {
            file_url: entry.file_url.trim(),
            file_name: entry.file_name.trim()
        } : null;

        const timestamp = (entry.list_type !== "notes") ? entry.created_at : null; // Exclude timestamp for notes

        // Pass the row ID and timestamp as part of the entry data
        const li = createListItem(
            entry.entry_text?.trim() || "[No Text]",
            listId,
            vin,
            index,
            fileData,
            entry.id, // Pass row ID for deletion
            timestamp // Pass timestamp for display, excluding for notes
        );

        list.appendChild(li);
    });

    console.log(`✅ Populated ${listId} with ${items.length} entries`);
}

function previewSelectedFile(fileInputId, previewContainerId) {
    const fileInput = document.getElementById(fileInputId);
    const previewContainer = document.getElementById(previewContainerId);

    if (!fileInput || !previewContainer) return;

    previewContainer.innerHTML = ""; // Clear previous preview

    const file = fileInput.files[0];
    if (file) {
        const fileItem = document.createElement("div");
        fileItem.className = "file-item";

        // 📎 Show filename with icon
        const nameDisplay = document.createElement("p");
        nameDisplay.textContent = `📎 ${file.name}`;
        fileItem.appendChild(nameDisplay);

        // 🖼️ Preview image or embed PDF if supported
        const fileType = file.type;

        if (fileType.startsWith("image/")) {
            const img = document.createElement("img");
            img.src = URL.createObjectURL(file);
            img.alt = "Selected preview";
            img.className = "preview-image";
            img.style.maxWidth = "100%";
            img.style.marginTop = "8px";
            fileItem.appendChild(img);
        } else if (fileType === "application/pdf") {
            const pdfPreview = document.createElement("embed");
            pdfPreview.src = URL.createObjectURL(file);
            pdfPreview.type = "application/pdf";
            pdfPreview.width = "100%";
            pdfPreview.height = "200px";
            pdfPreview.className = "preview-pdf";
            pdfPreview.style.marginTop = "8px";
            fileItem.appendChild(pdfPreview);
        }

        previewContainer.appendChild(fileItem);
    }
}

function renderFileList(li, fileData) {
    const fileListContainer = li.querySelector(".file-list");
    fileListContainer.innerHTML = "";

    if (!fileData || !fileData.file_url || !fileData.file_name) return;

    const fileItem = document.createElement("div");
    fileItem.className = "file-item";

    const fileLink = document.createElement("a");
    fileLink.href = fileData.file_url;
    fileLink.target = "_blank";
    fileLink.textContent = `📎 ${fileData.file_name}`;

    // Optional: Add a delete button (if needed in the future)
    // const deleteBtn = document.createElement("button");
    // deleteBtn.textContent = "🗑️";
    // deleteBtn.onclick = async function () {
    //     // Optional logic to delete the file from Supabase
    // };

    fileItem.appendChild(fileLink);
    // fileItem.appendChild(deleteBtn); // Uncomment if using delete logic
    fileListContainer.appendChild(fileItem);
}

async function deleteEntry(listId, index, id) {
    const vin = getVIN();
    const listType = listId.replace("List", "").toLowerCase();
    const listElement = document.getElementById(listId);
    const listItem = listElement.querySelector(`li[data-index="${index}"]`);

    if (!listItem) return;

    // 🗑️ Delete from Supabase by ID (row ID)
    const { error } = await supabase
        .from('truck_logs')
        .delete()
        .eq('id', id); // Deleting by row ID

    if (error) {
        console.error("❌ Failed to delete entry from Supabase:", error.message);
        return;
    }

    console.log("✅ Entry deleted from Supabase:", id);

    // 🔄 Refresh the log view to reflect the changes
    await loadTruckLog(); // Ensures all logs are up to date
}


function showSuccessMessage(message) {
    let msg = document.createElement("div");
    msg.textContent = message;
    msg.style.position = "fixed";
    msg.style.top = "10px";
    msg.style.right = "10px";
    msg.style.background = "#28a745";
    msg.style.color = "white";
    msg.style.padding = "10px 20px";
    msg.style.borderRadius = "5px";
    msg.style.zIndex = "1000";
    msg.style.boxShadow = "2px 2px 10px rgba(0, 0, 0, 0.3)";

    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 2000);
}
// Call this function after any successful update

function prefillEditForm() {
    const vin = getVIN();

    // Fetch truck details from the page
    const truckTitle = document.getElementById("truckTitle").textContent.trim();

    // Select paragraphs from truckDetails section and match based on content
    const truckDetails = document.getElementById("truckDetails");
    const details = {
        mileage: Array.from(truckDetails.querySelectorAll("p")).find(p => p.textContent.includes("Mileage"))?.textContent.replace("Mileage:", "").trim() || "",
        engine: Array.from(truckDetails.querySelectorAll("p")).find(p => p.textContent.includes("Engine Type"))?.textContent.replace("Engine Type:", "").trim() || "",
        fuel: Array.from(truckDetails.querySelectorAll("p")).find(p => p.textContent.includes("Fuel Type"))?.textContent.replace("Fuel Type:", "").trim() || "",
        title: Array.from(truckDetails.querySelectorAll("p")).find(p => p.textContent.includes("Title #"))?.textContent.replace("Title #:", "").trim() || "",
        plate: Array.from(truckDetails.querySelectorAll("p")).find(p => p.textContent.includes("Plate #"))?.textContent.replace("Plate #:", "").trim() || "",
        regExp: Array.from(truckDetails.querySelectorAll("p")).find(p => p.textContent.includes("Registration Exp"))?.textContent.replace("Registration Exp:", "").trim() || "",
        insExp: Array.from(truckDetails.querySelectorAll("p")).find(p => p.textContent.includes("Insurance Exp"))?.textContent.replace("Insurance Exp:", "").trim() || "",
        inspExp: Array.from(truckDetails.querySelectorAll("p")).find(p => p.textContent.includes("Inspection Exp"))?.textContent.replace("Inspection Exp:", "").trim() || "",
        status: document.getElementById("truckStatus")?.textContent.trim() || "In Operation"
    };

    // Prefill the modal with these details
    document.getElementById("editMileage").value = details.mileage;
    document.getElementById("editEngine").value = details.engine;
    document.getElementById("editFuel").value = details.fuel;
    document.getElementById("editVIN").value = vin;
    document.getElementById("editTitle").value = details.title;
    document.getElementById("editPlate").value = details.plate;
    document.getElementById("editRegExp").value = details.regExp;
    document.getElementById("editInsExp").value = details.insExp;
    document.getElementById("editInspExp").value = details.inspExp;
    document.getElementById("editStatus").value = details.status;
}

// ✏️ Open the Edit Modal
function openEditForm() {
    const modal = document.getElementById("editModal");
    if (modal) {
        modal.style.display = "flex"; // ✅ Open modal when button is clicked
    }
    prefillEditForm(); // ✅ Ensure truck details populate when opening modal
}

// ❌ Close the Edit Modal
function closeEditForm() {
    document.getElementById("editModal").style.display = "none";
}

window.onload = function () {
    const modal = document.getElementById("editModal");
    if (modal) modal.style.display = "none"; // Hide edit modal on load

    // ✅ Initialize Google API Client and load full truck data/logs
    gapi.load("client", async function () {
        await initClient(); // This calls loadTruckLog(), which does everything
    });

    // ✅ Handle delete button clicks dynamically
    document.body.addEventListener("click", function (event) {
        if (event.target.classList.contains("delete-btn")) {
            const listItem = event.target.closest("li");
            const listId = listItem?.parentElement?.id;
            const index = parseInt(listItem.getAttribute("data-index"), 10);
            if (listId && !isNaN(index)) {
                deleteEntry(listId, index);
            }
        }
    });

    // ✅ Export PDF Button Logic
    document.getElementById("exportPDF").addEventListener("click", async function () {
        const customerKey = "ac9506";
        const truckTitle = document.getElementById("truckTitle").textContent.trim().replace(/\s+/g, "_") || "Truck_Log";

        let apiUrl = `https://api.screenshotmachine.com?key=${customerKey}`
            + `&url=${encodeURIComponent(window.location.href)}`
            + `&device=desktop`
            + `&dimension=1366xfull`
            + `&format=png`
            + `&cacheLimit=0`
            + `&delay=400`
            + `&zoom=100`
            + `&hide=.bottom-buttons`;

        try {
            let response = await fetch(apiUrl);
            let blob = await response.blob();

            let a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${truckTitle}_log_screenshot.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            console.log("Screenshot saved as:", a.download);
        } catch (error) {
            console.error("Error capturing screenshot:", error);
        }
    });

    // ✅ Enter key support for all entry inputs
    ["maintenanceInput", "repairsInput", "notesInput"].forEach(inputId => {
        const inputField = document.getElementById(inputId);
        inputField.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                if (inputId === "maintenanceInput") {
                    addEntry("maintenanceList", "maintenanceInput", "maintenanceFile");
                } else if (inputId === "repairsInput") {
                    addEntry("repairsList", "repairsInput", "repairsFile");
                } else if (inputId === "notesInput") {
                    addEntry("notesList", "notesInput", "notesFile");
                }
            }
        });
    });

    // ✅ Expose entry & modal functions to global scope
    window.addEntry = addEntry;
    window.openEditForm = openEditForm;
    window.closeEditForm = closeEditForm;
};