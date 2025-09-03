callWithJQuery = (pivotModule) ->
    if typeof exports is "object" and typeof module is "object" # CommonJS
        pivotModule require("jquery")
    else if typeof define is "function" and define.amd # AMD
        define ["jquery"], pivotModule
    # Plain browser env
    else
        pivotModule jQuery

callWithJQuery ($) ->

    ###
    Utilities
    ###

    addSeparators = (nStr, thousandsSep, decimalSep) ->
        nStr += ''
        x = nStr.split('.')
        x1 = x[0]
        x2 = if x.length > 1 then  decimalSep + x[1] else ''
        rgx = /(\d+)(\d{3})/
        x1 = x1.replace(rgx, '$1' + thousandsSep + '$2') while rgx.test(x1)
        return x1 + x2

    numberFormat = (opts) ->
        defaults =
            digitsAfterDecimal: 2, scaler: 1,
            thousandsSep: ",", decimalSep: "."
            prefix: "", suffix: ""
        opts = $.extend({}, defaults, opts)
        (x) ->
            return "" if isNaN(x) or not isFinite(x)
            result = addSeparators (opts.scaler*x).toFixed(opts.digitsAfterDecimal), opts.thousandsSep, opts.decimalSep
            return ""+opts.prefix+result+opts.suffix

    #aggregator templates default to US number formatting but this is overrideable
    usFmt = numberFormat()
    usFmtInt = numberFormat(digitsAfterDecimal: 0)
    usFmtPct = numberFormat(digitsAfterDecimal:1, scaler: 100, suffix: "%")

    aggregatorTemplates =
        count: (formatter=usFmtInt) -> () -> (data, rowKey, colKey) ->
            count: 0
            push:  -> @count++
            value: -> @count
            format: formatter

        uniques: (fn, formatter=usFmtInt) -> ([attr]) -> (data, rowKey, colKey) ->
            uniq: []
            push: (record) -> @uniq.push(record[attr]) if record[attr] not in @uniq
            value: -> fn(@uniq)
            format: formatter
            numInputs: if attr? then 0 else 1

        sum: (formatter=usFmt) -> ([attr]) -> (data, rowKey, colKey) ->
            sum: 0
            push: (record) -> @sum += parseFloat(record[attr]) if not isNaN parseFloat(record[attr])
            value: -> @sum
            format: formatter
            numInputs: if attr? then 0 else 1

        extremes: (mode, formatter=usFmt) -> ([attr]) -> (data, rowKey, colKey) ->
            val: null
            sorter: getSort(data?.sorters, attr)
            push: (record) ->
                x = record[attr]
                if mode in ["min", "max"]
                    x = parseFloat(x)
                    if not isNaN x then @val = Math[mode](x, @val ? x)
                if mode == "first" then @val = x if @sorter(x, @val ? x) <= 0
                if mode == "last"  then @val = x if @sorter(x, @val ? x) >= 0
            value: -> @val
            format: (x) -> if isNaN(x) then x else formatter(x)
            numInputs: if attr? then 0 else 1

        quantile: (q, formatter=usFmt) -> ([attr]) -> (data, rowKey, colKey) ->
            vals: []
            push: (record) ->
                x = parseFloat(record[attr])
                @vals.push(x) if not isNaN(x)
            value: ->
                return null if @vals.length == 0
                @vals.sort((a,b) -> a-b)
                i = (@vals.length-1)*q
                return (@vals[Math.floor(i)] + @vals[Math.ceil(i)])/2.0
            format: formatter
            numInputs: if attr? then 0 else 1

        runningStat: (mode="mean", ddof=1, formatter=usFmt) -> ([attr]) -> (data, rowKey, colKey) ->
            n: 0.0, m: 0.0, s: 0.0
            push: (record) ->
                x = parseFloat(record[attr])
                return if isNaN(x)
                @n += 1.0
                if @n == 1.0
                    @m = x
                else
                    m_new = @m + (x - @m)/@n
                    @s = @s + (x - @m)*(x - m_new)
                    @m = m_new
            value: ->
                if mode == "mean"
                    return if @n == 0 then 0/0 else @m
                return 0 if @n <= ddof
                switch mode
                    when "var"   then @s/(@n-ddof)
                    when "stdev" then Math.sqrt(@s/(@n-ddof))
            format: formatter
            numInputs: if attr? then 0 else 1

        sumOverSum: (formatter=usFmt) -> ([num, denom]) -> (data, rowKey, colKey) ->
            sumNum: 0
            sumDenom: 0
            push: (record) ->
                @sumNum   += parseFloat(record[num])   if not isNaN parseFloat(record[num])
                @sumDenom += parseFloat(record[denom]) if not isNaN parseFloat(record[denom])
            value: -> @sumNum/@sumDenom
            format: formatter
            numInputs: if num? and denom? then 0 else 2

        sumOverSumBound80: (upper=true, formatter=usFmt) -> ([num, denom]) -> (data, rowKey, colKey) ->
            sumNum: 0
            sumDenom: 0
            push: (record) ->
                @sumNum   += parseFloat(record[num])   if not isNaN parseFloat(record[num])
                @sumDenom += parseFloat(record[denom]) if not isNaN parseFloat(record[denom])
            value: ->
                sign = if upper then 1 else -1
                (0.821187207574908/@sumDenom + @sumNum/@sumDenom + 1.2815515655446004*sign*
                    Math.sqrt(0.410593603787454/ (@sumDenom*@sumDenom) + (@sumNum*(1 - @sumNum/ @sumDenom))/ (@sumDenom*@sumDenom)))/
                    (1 + 1.642374415149816/@sumDenom)
            format: formatter
            numInputs: if num? and denom? then 0 else 2

        fractionOf: (wrapped, type="total", formatter=usFmtPct) -> (x...) -> (data, rowKey, colKey) ->
            selector: {total:[[],[]],row:[rowKey,[]],col:[[],colKey]}[type]
            inner: wrapped(x...)(data, rowKey, colKey)
            push: (record) -> @inner.push record
            format: formatter
            value: -> @inner.value() / data.getAggregator(@selector...).inner.value()
            numInputs: wrapped(x...)().numInputs

    aggregatorTemplates.countUnique = (f) -> aggregatorTemplates.uniques(((x) -> x.length), f)
    aggregatorTemplates.listUnique =  (s) -> aggregatorTemplates.uniques(((x) -> x.sort(naturalSort).join(s)), ((x)->x))
    aggregatorTemplates.max =         (f) -> aggregatorTemplates.extremes('max', f)
    aggregatorTemplates.min =         (f) -> aggregatorTemplates.extremes('min', f)
    aggregatorTemplates.first =       (f) -> aggregatorTemplates.extremes('first', f)
    aggregatorTemplates.last =        (f) -> aggregatorTemplates.extremes('last', f)
    aggregatorTemplates.median =      (f) -> aggregatorTemplates.quantile(0.5, f)
    aggregatorTemplates.average =     (f) -> aggregatorTemplates.runningStat("mean", 1, f)
    aggregatorTemplates.var =         (ddof, f) -> aggregatorTemplates.runningStat("var", ddof, f)
    aggregatorTemplates.stdev =       (ddof, f) -> aggregatorTemplates.runningStat("stdev", ddof, f)

    #default aggregators & renderers use US naming and number formatting
    aggregators = do (tpl = aggregatorTemplates) ->
        "Count":                tpl.count(usFmtInt)
        "Count Unique Values":  tpl.countUnique(usFmtInt)
        "List Unique Values":   tpl.listUnique(", ")
        "Sum":                  tpl.sum(usFmt)
        "Integer Sum":          tpl.sum(usFmtInt)
        "Average":              tpl.average(usFmt)
        "Median":               tpl.median(usFmt)
        "Sample Variance":      tpl.var(1, usFmt)
        "Sample Standard Deviation": tpl.stdev(1, usFmt)
        "Minimum":              tpl.min(usFmt)
        "Maximum":              tpl.max(usFmt)
        "First":                tpl.first(usFmt)
        "Last":                 tpl.last(usFmt)
        "Sum over Sum":         tpl.sumOverSum(usFmt)
        "80% Upper Bound":      tpl.sumOverSumBound80(true, usFmt)
        "80% Lower Bound":      tpl.sumOverSumBound80(false, usFmt)
        "Sum as Fraction of Total":     tpl.fractionOf(tpl.sum(),   "total", usFmtPct)
        "Sum as Fraction of Rows":      tpl.fractionOf(tpl.sum(),   "row",   usFmtPct)
        "Sum as Fraction of Columns":   tpl.fractionOf(tpl.sum(),   "col",   usFmtPct)
        "Count as Fraction of Total":   tpl.fractionOf(tpl.count(), "total", usFmtPct)
        "Count as Fraction of Rows":    tpl.fractionOf(tpl.count(), "row",   usFmtPct)
        "Count as Fraction of Columns": tpl.fractionOf(tpl.count(), "col",   usFmtPct)

    renderers =
        "Table":          (data, opts) ->   pivotTableRendererVirtualized(data, opts)
        "Table Barchart": (data, opts) -> $(pivotTableRenderer(data, opts)).barchart()
        "Heatmap":        (data, opts) -> $(pivotTableRenderer(data, opts)).heatmap("heatmap",    opts)
        "Row Heatmap":    (data, opts) -> $(pivotTableRenderer(data, opts)).heatmap("rowheatmap", opts)
        "Col Heatmap":    (data, opts) -> $(pivotTableRenderer(data, opts)).heatmap("colheatmap", opts)

    locales =
        en:
            aggregators: aggregators
            renderers: renderers
            localeStrings:
                renderError: "An error occurred rendering the PivotTable results."
                computeError: "An error occurred computing the PivotTable results."
                uiRenderError: "An error occurred rendering the PivotTable UI."
                selectAll: "Select All"
                selectNone: "Select None"
                tooMany: "(too many to list)"
                filterResults: "Filter values"
                apply: "Apply"
                cancel: "Cancel"
                totals: "Totals" #for table renderer
                vs: "vs" #for gchart renderer
                by: "by" #for gchart renderer

    #dateFormat deriver l10n requires month and day names to be passed in directly
    mthNamesEn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    dayNamesEn = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
    zeroPad = (number) -> ("0"+number).substr(-2,2)

    derivers =
        bin: (col, binWidth) -> (record) -> record[col] - record[col] % binWidth
        dateFormat: (col, formatString, utcOutput=false, mthNames=mthNamesEn, dayNames=dayNamesEn) ->
            utc = if utcOutput then "UTC" else ""
            (record) -> #thanks http://stackoverflow.com/a/12213072/112871
                date = new Date(Date.parse(record[col]))
                if isNaN(date) then return ""
                formatString.replace /%(.)/g, (m, p) ->
                    switch p
                        when "y" then date["get#{utc}FullYear"]()
                        when "m" then zeroPad(date["get#{utc}Month"]()+1)
                        when "n" then mthNames[date["get#{utc}Month"]()]
                        when "d" then zeroPad(date["get#{utc}Date"]())
                        when "w" then dayNames[date["get#{utc}Day"]()]
                        when "x" then date["get#{utc}Day"]()
                        when "H" then zeroPad(date["get#{utc}Hours"]())
                        when "M" then zeroPad(date["get#{utc}Minutes"]())
                        when "S" then zeroPad(date["get#{utc}Seconds"]())
                        else "%" + p

    rx = /(\d+)|(\D+)/g
    rd = /\d/
    rz = /^0/
    naturalSort = (as, bs) =>
        #nulls first
        return -1 if bs? and not as?
        return  1 if as? and not bs?

        #then raw NaNs
        return -1 if typeof as == "number" and isNaN(as)
        return  1 if typeof bs == "number" and isNaN(bs)

        #numbers and numbery strings group together
        nas = +as
        nbs = +bs
        return -1 if nas < nbs
        return  1 if nas > nbs

        #within that, true numbers before numbery strings
        return -1 if typeof as == "number" and typeof bs != "number"
        return  1 if typeof bs == "number" and typeof as != "number"
        return  0 if typeof as == "number" and typeof bs == "number"

        # 'Infinity' is a textual number, so less than 'A'
        return -1 if isNaN(nbs) and not isNaN(nas)
        return  1 if isNaN(nas) and not isNaN(nbs)

        #finally, "smart" string sorting per http://stackoverflow.com/a/4373421/112871
        a = String(as)
        b = String(bs)
        return 0 if a == b
        return (if a > b then 1 else -1) unless rd.test(a) and rd.test(b)

        #special treatment for strings containing digits
        a = a.match(rx) #create digits vs non-digit chunks and iterate through
        b = b.match(rx)
        while a.length and b.length
            a1 = a.shift()
            b1 = b.shift()
            if a1 != b1
                if rd.test(a1) and rd.test(b1) #both are digit chunks
                    return a1.replace(rz, ".0") - b1.replace(rz, ".0")
                else
                    return (if a1 > b1 then 1 else -1)
        return a.length - b.length

    sortAs = (order) ->
        mapping = {}
        l_mapping = {} # sort lowercased keys similarly
        for i, x of order
            mapping[x] = i
            l_mapping[x.toLowerCase()] = i if typeof x == "string"
        (a, b) ->
            if mapping[a]? and mapping[b]? then mapping[a] - mapping[b]
            else if mapping[a]? then -1
            else if mapping[b]? then 1
            else if l_mapping[a]? and l_mapping[b]? then l_mapping[a] - l_mapping[b]
            else if l_mapping[a]? then -1
            else if l_mapping[b]? then 1
            else naturalSort(a,b)

    getSort = (sorters, attr) ->
        if sorters?
            if $.isFunction(sorters)
                sort = sorters(attr)
                return sort if $.isFunction(sort)
            else if sorters[attr]?
                return sorters[attr]
        return naturalSort

    ###
    Data Model class
    ###

    class PivotData
        constructor: (input, opts = {}) ->
            @input = input
            @aggregator = opts.aggregator ? aggregatorTemplates.count()()
            @aggregatorName = opts.aggregatorName ? "Count"
            @colAttrs = opts.cols ? []
            @rowAttrs = opts.rows ? []
            @valAttrs = opts.vals ? []
            @sorters = opts.sorters ? {}
            @rowOrder = opts.rowOrder ? "key_a_to_z"
            @colOrder = opts.colOrder ? "key_a_to_z"
            @derivedAttributes = opts.derivedAttributes ? {}
            @filter = opts.filter ? (-> true)
            @tree = {}
            @rowKeys = []
            @colKeys = []
            @rowTotals = {}
            @colTotals = {}
            @allTotal = @aggregator(this, [], [])
            @sorted = false

            # Async options
            @asyncMode = opts.asyncMode ? false
            @lifecycleCallback = opts.rendererOptions.lifecycleCallback ? null
            @progressInterval = opts.rendererOptions.progressInterval ? 1000
            @aborted = false
            @startTime = null
            @processedRecords = 0
            @totalRecords = 0
            @dataReady = !@asyncMode  # true for sync, false for async until processing completes

            # iterate through input, accumulating data for cells
            if @asyncMode
                @processDataAsync()
            else
                PivotData.forEachRecord @input, @derivedAttributes, (record) =>
                    @processRecord(record) if @filter(record)

        #can handle arrays or jQuery selections of tables
        @forEachRecord = (input, derivedAttributes, f) ->
            if $.isEmptyObject derivedAttributes
                addRecord = f
            else
                addRecord = (record) ->
                    record[k] = v(record) ? record[k] for k, v of derivedAttributes
                    f(record)

            #if it's a function, have it call us back
            if $.isFunction(input)
                input(addRecord)
            else if $.isArray(input)
                if $.isArray(input[0]) #array of arrays
                    for own i, compactRecord of input when i > 0
                        record = {}
                        record[k] = compactRecord[j] for own j, k of input[0]
                        addRecord(record)
                else #array of objects
                    addRecord(record) for record in input
            else if input instanceof $
                tblCols = []
                $("thead > tr > th", input).each (i) -> tblCols.push $(this).text()
                $("tbody > tr", input).each (i) ->
                    record = {}
                    $("td", this).each (j) -> record[tblCols[j]] = $(this).text()
                    addRecord(record)
            else
                throw new Error("unknown input format")

        forEachMatchingRecord: (criteria, callback) ->
            PivotData.forEachRecord @input, @derivedAttributes, (record) =>
                return if not @filter(record)
                for k, v of criteria
                    return if v != (record[k] ? "null")
                callback(record)

        arrSort: (attrs) =>
            sortersArr = (getSort(@sorters, a) for a in attrs)
            (a,b) ->
                for own i, sorter of sortersArr
                    comparison = sorter(a[i], b[i])
                    return comparison if comparison != 0
                return 0

        sortKeys: () =>
            if not @sorted
                @sorted = true
                v = (r,c) => @getAggregator(r,c).value()
                switch @rowOrder
                    when "value_a_to_z"  then @rowKeys.sort (a,b) =>  naturalSort v(a,[]), v(b,[])
                    when "value_z_to_a" then @rowKeys.sort (a,b) => -naturalSort v(a,[]), v(b,[])
                    else             @rowKeys.sort @arrSort(@rowAttrs)
                switch @colOrder
                    when "value_a_to_z"  then @colKeys.sort (a,b) =>  naturalSort v([],a), v([],b)
                    when "value_z_to_a" then @colKeys.sort (a,b) => -naturalSort v([],a), v([],b)
                    else             @colKeys.sort @arrSort(@colAttrs)

        getColKeys: () =>
            @sortKeys()
            return @colKeys

        getRowKeys: () =>
            @sortKeys()
            return @rowKeys

        processRecord: (record) -> #this code is called in a tight loop
            colKey = []
            rowKey = []
            colKey.push record[x] ? "null" for x in @colAttrs
            rowKey.push record[x] ? "null" for x in @rowAttrs
            flatRowKey = rowKey.join(String.fromCharCode(0))
            flatColKey = colKey.join(String.fromCharCode(0))

            @allTotal.push record

            if rowKey.length != 0
                if not @rowTotals[flatRowKey]
                    @rowKeys.push rowKey
                    @rowTotals[flatRowKey] = @aggregator(this, rowKey, [])
                @rowTotals[flatRowKey].push record

            if colKey.length != 0
                if not @colTotals[flatColKey]
                    @colKeys.push colKey
                    @colTotals[flatColKey] = @aggregator(this, [], colKey)
                @colTotals[flatColKey].push record

            if colKey.length != 0 and rowKey.length != 0
                if not @tree[flatRowKey]
                    @tree[flatRowKey] = {}
                if not @tree[flatRowKey][flatColKey]
                    @tree[flatRowKey][flatColKey] = @aggregator(this, rowKey, colKey)
                @tree[flatRowKey][flatColKey].push record

        getAggregator: (rowKey, colKey) =>
            flatRowKey = rowKey.join(String.fromCharCode(0))
            flatColKey = colKey.join(String.fromCharCode(0))
            if rowKey.length == 0 and colKey.length == 0
                agg = @allTotal
            else if rowKey.length == 0
                agg = @colTotals[flatColKey]
            else if colKey.length == 0
                agg = @rowTotals[flatRowKey]
            else
                agg = @tree[flatRowKey][flatColKey]
            return agg ? {value: (-> null), format: -> ""}

        # Async data processing methods
        abort: =>
            @aborted = true

        callLifecycleCallback: (stage) =>
            return unless @lifecycleCallback?

            elapsedTime = if @startTime then Date.now() - @startTime else 0
            progress = if @totalRecords > 0 then Math.round((@processedRecords / @totalRecords) * 100) else 0

            metadata = {
                stage: stage
                progress: progress
                elapsedTime: elapsedTime
                totalRows: @totalRecords
                currentIndex: @processedRecords
            }

            abortFn = null
            if stage in ['data-started', 'data-progress']
                abortFn = => @abort()

            toggleVirtualizationFn = null

            @lifecycleCallback(metadata, abortFn, toggleVirtualizationFn)

        countTotalRecords: =>
            count = 0
            PivotData.forEachRecord @input, @derivedAttributes, (record) =>
                count++ if @filter(record)
            @totalRecords = count

        processDataAsync: =>
            @startTime = Date.now()
            @aborted = false

            # First count total records for progress tracking
            setTimeout =>
                @countTotalRecords()
                @callLifecycleCallback('data-started')
                @processRecordsAsync()
            , 0

        processRecordsAsync: =>
            records = []

            # Collect all records first
            PivotData.forEachRecord @input, @derivedAttributes, (record) =>
                records.push(record) if @filter(record)

            @totalRecords = records.length  # Set total records here
            @processRecordsBatch(records, 0)

        processRecordsBatch: (records, startIndex) =>
            return if @aborted

            batchSize = Math.min(@progressInterval, records.length - startIndex)
            endIndex = startIndex + batchSize

            # Process batch
            for i in [startIndex...endIndex]
                record = records[i]
                @processRecord(record)
                @processedRecords++
                @callLifecycleCallback('data-progress')

            if endIndex < records.length
                # Continue with next batch
                setTimeout =>
                    @processRecordsBatch(records, endIndex)
                , 0
            else
                # Processing complete
                @dataReady = true  # Add flag to indicate data is ready
                @callLifecycleCallback('data-completed')

    #expose these to the outside world
    $.pivotUtilities = {aggregatorTemplates, aggregators, renderers, derivers, locales,
        naturalSort, numberFormat, sortAs, PivotData, pivotTableRendererVirtualized, pivotTableRendererAsync}

    ###
    Async Pivot Table renderer with progress callbacks
    ###

    pivotTableRendererAsync = (pivotData, opts) ->
        startTime = Date.now()
        aborted = false

        return new Promise (resolve, reject) ->
            try
                defaults =
                    renderChunkSize: 100  # Размер чанка для рендеринга строк
                    lifecycleCallback: null
                    table:
                        clickCallback: null
                        rowTotals: true
                        colTotals: true
                        virtualization:
                            enabled: true
                            rowHeight: 30
                            bufferSize: 5
                            containerHeight: 400
                            headerHeight: 60
                            threshold: 1000  # Использовать виртуализацию для таблиц больше 1000 строк
                            autoHeight: false  # Автоматически определять высоту на основе pvtUi
                    localeStrings: totals: "Totals"

                opts = $.extend(true, {}, defaults, opts)

                callLifecycle = (stage, progress = 0, metadata = null) ->
                    return unless opts.lifecycleCallback?

                    data = {
                        stage: stage
                        progress: progress
                        elapsedTime: Date.now() - startTime
                        totalRows: metadata?.totalRows
                        totalCols: metadata?.totalCols
                        isVirtualized: metadata?.isVirtualized
                        domElements: metadata?.domElements
                        currentIndex: metadata?.currentIndex
                        endIndex: metadata?.endIndex
                    }

                    abortFn = null
                    if stage in ['render-started', 'render-progress']
                        abortFn = -> aborted = true

                    toggleVirtualizationFn = null
                    if stage in ['render-started']
                        toggleVirtualizationFn = (enabled) ->
                            opts.table = opts.table ? {}
                            opts.table.virtualization = opts.table.virtualization ? {}
                            opts.table.virtualization.enabled = enabled

                    lifecycleCallback(data, abortFn, toggleVirtualizationFn)

                # Проверяем, нужна ли виртуализация
                totalRows = pivotData.getRowKeys().length
                shouldVirtualize = opts.table.virtualization.enabled and
                                 totalRows > opts.table.virtualization.threshold

                callLifecycle('render-started', 0, {
                    totalRows: totalRows
                    totalCols: pivotData.getColKeys().length,
                    isVirtualized: shouldVirtualize
                })

                return resolve($("<div>").text("Rendering aborted by user")) if aborted

                if shouldVirtualize
                    callLifecycle('render-progress', 0)
                    result = pivotTableRendererVirtualized(pivotData, opts)
                    callLifecycle('render-completed', 100, {
                        totalRows: pivotData.getRowKeys().length
                        totalCols: pivotData.getColKeys().length
                        isVirtualized: true
                        domElements: result.querySelectorAll('*').length
                    })
                    resolve(result)
                    return

                colAttrs = pivotData.colAttrs
                rowAttrs = pivotData.rowAttrs
                rowKeys = pivotData.getRowKeys()
                colKeys = pivotData.getColKeys()

                if opts.table.clickCallback
                    getClickHandler = (value, rowValues, colValues) ->
                        filters = {}
                        filters[attr] = colValues[i] for own i, attr of colAttrs when colValues[i]?
                        filters[attr] = rowValues[i] for own i, attr of rowAttrs when rowValues[i]?
                        return (e) -> opts.table.clickCallback(e, value, filters, pivotData)

                precomputeSpans = (arr) ->
                    spans = []
                    for i in [0...arr.length]
                        spans[i] = []
                        for j in [0...arr[i].length]
                            spans[i][j] = spanSize(arr, i, j)
                    return spans

                #helper function for setting row/col-span in pivotTableRenderer
                spanSize = (arr, i, j) ->
                    if i != 0
                        noDraw = true
                        for x in [0..j]
                            if arr[i-1][x] != arr[i][x]
                                noDraw = false
                        if noDraw
                          return -1 #do not draw cell
                    len = 0
                    while i+len < arr.length
                        stop = false
                        for x in [0..j]
                            stop = true if arr[i][x] != arr[i+len][x]
                        break if stop
                        len++
                    return len

                rowSpans = precomputeSpans(rowKeys)
                colSpans = precomputeSpans(colKeys)

                #now actually build the output
                result = document.createElement("table")
                result.className = "pvtTable"

                theadFragment = document.createDocumentFragment()

                #the first few rows are for col headers
                for own j, c of colAttrs
                    tr = document.createElement("tr")
                    if parseInt(j) == 0 and rowAttrs.length != 0
                        th = document.createElement("th")
                        th.setAttribute("colspan", rowAttrs.length)
                        th.setAttribute("rowspan", colAttrs.length)
                        tr.appendChild th
                    th = document.createElement("th")
                    th.className = "pvtAxisLabel"
                    th.textContent = opts.labels?[c] ? c
                    tr.appendChild th

                    for own i, colKey of colKeys
                        x = colSpans[parseInt(i)][parseInt(j)]
                        if x != -1
                            th = document.createElement("th")
                            th.className = "pvtColLabel"
                            th.textContent = colKey[j]
                            th.setAttribute("colspan", x)
                            if parseInt(j) == colAttrs.length-1 and rowAttrs.length != 0
                                th.setAttribute("rowspan", 2)
                            tr.appendChild th
                    if parseInt(j) == 0 && opts.table.rowTotals
                        th = document.createElement("th")
                        th.className = "pvtTotalLabel pvtRowTotalLabel"
                        th.innerHTML = opts.localeStrings.totals
                        th.setAttribute("rowspan", colAttrs.length + (if rowAttrs.length == 0 then 0 else 1))
                        tr.appendChild th
                    theadFragment.appendChild tr

                thead = document.createElement("thead")
                thead.appendChild(theadFragment)

                #then a row for row header headers
                if rowAttrs.length !=0
                    tr = document.createElement("tr")
                    for own i, r of rowAttrs
                        th = document.createElement("th")
                        th.className = "pvtAxisLabel"
                        th.textContent = opts.labels[r] ? r
                        tr.appendChild th
                    th = document.createElement("th")
                    if colAttrs.length ==0
                        th.className = "pvtTotalLabel pvtRowTotalLabel"
                        th.innerHTML = opts.localeStrings.totals
                    tr.appendChild th
                    thead.appendChild tr
                result.appendChild thead

                callLifecycle('render-progress', 1)
                return resolve($("<div>").text("Rendering aborted by user")) if aborted

                # Async processing of data rows
                tbody = document.createElement("tbody")
                totalRows = rowKeys.length
                currentIndex = 0

                createDataRow = (i, rowKey) ->
                    tr = document.createElement("tr")

                    for own j, txt of rowKey
                        x = rowSpans[parseInt(i)][parseInt(j)]
                        if x != -1
                            th = document.createElement("th")
                            th.className = "pvtRowLabel"
                            th.textContent = txt
                            th.setAttribute("rowspan", x)
                            if parseInt(j) == rowAttrs.length-1 and colAttrs.length != 0
                                th.setAttribute("colspan", 2)
                            tr.appendChild th

                    for own j, colKey of colKeys
                        aggregator = pivotData.getAggregator(rowKey, colKey)
                        val = aggregator.value()
                        td = document.createElement("td")
                        td.className = "pvtVal row#{i} col#{j}"
                        td.textContent = aggregator.format(val)
                        td.setAttribute("data-value", val)
                        if getClickHandler?
                            td.onclick = getClickHandler(val, rowKey, colKey)
                        tr.appendChild td

                    if opts.table.rowTotals || colAttrs.length == 0
                        totalAggregator = pivotData.getAggregator(rowKey, [])
                        val = totalAggregator.value()
                        td = document.createElement("td")
                        td.className = "pvtTotal rowTotal"
                        td.textContent = totalAggregator.format(val)
                        td.setAttribute("data-value", val)
                        if getClickHandler?
                            td.onclick = getClickHandler(val, rowKey, [])
                        td.setAttribute("data-for", "row#{i}")
                        tr.appendChild td

                    return tr

                processRowsBatch = ->
                    return if currentIndex >= totalRows or aborted

                    batchSize = Math.min(opts.renderChunkSize, totalRows - currentIndex)
                    endIndex = currentIndex + batchSize

                    fragment = document.createDocumentFragment()
                    for i in [currentIndex...endIndex]
                        rowKey = rowKeys[i]
                        tr = createDataRow(i, rowKey)
                        fragment.appendChild tr

                    tbody.appendChild(fragment)

                    progress = 1 + Math.round((endIndex / totalRows) * 98)
                    callLifecycle('render-progress', progress, {
                        currentIndex: currentIndex,
                        endIndex: endIndex,
                        totalRows: totalRows
                    })

                    return if aborted

                    currentIndex = endIndex

                    if currentIndex >= totalRows
                        finishRendering()
                    else
                        if window.requestAnimationFrame?
                            requestAnimationFrame(processRowsBatch)
                        else
                            setTimeout(processRowsBatch, 1)

                finishRendering = ->
                    callLifecycle('render-progress', 100, {
                        currentIndex: currentIndex,
                        endIndex: currentIndex,
                        totalRows: totalRows
                    })

                    return if aborted

                    #finally, the row for col totals, and a grand total
                    if opts.table.colTotals || rowAttrs.length == 0
                        tr = document.createElement("tr")

                        if opts.table.colTotals || rowAttrs.length == 0
                            th = document.createElement("th")
                            th.className = "pvtTotalLabel pvtColTotalLabel"
                            th.innerHTML = opts.localeStrings.totals
                            th.setAttribute("colspan", rowAttrs.length + (if colAttrs.length == 0 then 0 else 1))
                            tr.appendChild th

                        totalsFragment = document.createDocumentFragment()

                        for own j, colKey of colKeys
                            totalAggregator = pivotData.getAggregator([], colKey)
                            val = totalAggregator.value()
                            td = document.createElement("td")
                            td.className = "pvtTotal colTotal"
                            td.textContent = totalAggregator.format(val)
                            td.setAttribute("data-value", val)
                            if getClickHandler?
                                td.onclick = getClickHandler(val, [], colKey)
                            td.setAttribute("data-for", "col"+j)
                            totalsFragment.appendChild(td)

                        tr.appendChild(totalsFragment)

                        if opts.table.rowTotals || colAttrs.length == 0
                            totalAggregator = pivotData.getAggregator([], [])
                            val = totalAggregator.value()
                            td = document.createElement("td")
                            td.className = "pvtGrandTotal"
                            td.textContent = totalAggregator.format(val)
                            td.setAttribute("data-value", val)
                            if getClickHandler?
                                td.onclick = getClickHandler(val, [], [])
                            tr.appendChild td

                        tbody.appendChild(tr)

                    result.appendChild(tbody)

                    callLifecycle('render-completed', 100, {
                        totalRows: rowKeys.length
                        totalCols: colKeys.length
                        isVirtualized: false
                        domElements: result.querySelectorAll('*').length
                    })
                    resolve(result)

                # Начинаем обработку строк
                if totalRows > 0
                    processRowsBatch()
                else
                    finishRendering()

            catch error
                console.error("Error during async rendering:", error)
                reject(error)

    ###
    Default Renderer for hierarchical table layout
    ###

    pivotTableRenderer = (pivotData, opts) ->

        defaults =
            table:
                clickCallback: null
                rowTotals: true
                colTotals: true
            localeStrings: totals: "Totals"
            lifecycleCallback: null

        opts = $.extend(true, {}, defaults, opts)

        aborted = false
        startTime = Date.now()

        callLifecycle = (stage, progress = 0, metadata = null) ->
            return unless opts.lifecycleCallback?

            data = {
                stage: stage
                progress: progress
                elapsedTime: Date.now() - startTime
                totalRows: metadata?.totalRows
                totalCols: metadata?.totalCols
                isVirtualized: false
                domElements: metadata?.domElements
                currentIndex: metadata?.currentIndex
                endIndex: metadata?.endIndex
            }
            # totalRows: pivotData.getRowKeys().length
            # totalCols: pivotData.getColKeys().length

            abortFn = null
            toggleVirtualizationFn = null
            if stage in ['render-started', 'render-progress']
                abortFn = -> aborted = true

            opts.lifecycleCallback(data, abortFn, toggleVirtualizationFn)

        callLifecycle('render-started')
        return $("<div>").text("Rendering aborted by user") if aborted

        colAttrs = pivotData.colAttrs
        rowAttrs = pivotData.rowAttrs
        rowKeys = pivotData.getRowKeys()
        colKeys = pivotData.getColKeys()

        if opts.table.clickCallback
            getClickHandler = (value, rowValues, colValues) ->
                filters = {}
                filters[attr] = colValues[i] for own i, attr of colAttrs when colValues[i]?
                filters[attr] = rowValues[i] for own i, attr of rowAttrs when rowValues[i]?
                return (e) -> opts.table.clickCallback(e, value, filters, pivotData)

        #now actually build the output
        result = document.createElement("table")
        result.className = "pvtTable"

        #helper function for setting row/col-span in pivotTableRenderer
        spanSize = (arr, i, j) ->
            if i != 0
                noDraw = true
                for x in [0..j]
                    if arr[i-1][x] != arr[i][x]
                        noDraw = false
                if noDraw
                  return -1 #do not draw cell
            len = 0
            while i+len < arr.length
                stop = false
                for x in [0..j]
                    stop = true if arr[i][x] != arr[i+len][x]
                break if stop
                len++
            return len

        #the first few rows are for col headers
        thead = document.createElement("thead")
        for own j, c of colAttrs
            tr = document.createElement("tr")
            if parseInt(j) == 0 and rowAttrs.length != 0
                th = document.createElement("th")
                th.setAttribute("colspan", rowAttrs.length)
                th.setAttribute("rowspan", colAttrs.length)
                tr.appendChild th
            th = document.createElement("th")
            th.className = "pvtAxisLabel"
            th.textContent = opts.labels[c] ? c
            tr.appendChild th
            for own i, colKey of colKeys
                x = spanSize(colKeys, parseInt(i), parseInt(j))
                if x != -1
                    th = document.createElement("th")
                    th.className = "pvtColLabel"
                    th.textContent = colKey[j]
                    th.setAttribute("colspan", x)
                    if parseInt(j) == colAttrs.length-1 and rowAttrs.length != 0
                        th.setAttribute("rowspan", 2)
                    tr.appendChild th
            if parseInt(j) == 0 && opts.table.rowTotals
                th = document.createElement("th")
                th.className = "pvtTotalLabel pvtRowTotalLabel"
                th.innerHTML = opts.localeStrings.totals
                th.setAttribute("rowspan", colAttrs.length + (if rowAttrs.length ==0 then 0 else 1))
                tr.appendChild th
            thead.appendChild tr

        #then a row for row header headers
        if rowAttrs.length !=0
            tr = document.createElement("tr")
            for own i, r of rowAttrs
                th = document.createElement("th")
                th.className = "pvtAxisLabel"
                th.textContent = opts.labels[r] ? r
                tr.appendChild th
            th = document.createElement("th")
            if colAttrs.length ==0
                th.className = "pvtTotalLabel pvtRowTotalLabel"
                th.innerHTML = opts.localeStrings.totals
            tr.appendChild th
            thead.appendChild tr
        result.appendChild thead

        #now the actual data rows, with their row headers and totals
        tbody = document.createElement("tbody")
        for own i, rowKey of rowKeys
            tr = document.createElement("tr")
            for own j, txt of rowKey
                x = spanSize(rowKeys, parseInt(i), parseInt(j))
                if x != -1
                    th = document.createElement("th")
                    th.className = "pvtRowLabel"
                    th.textContent = txt
                    th.setAttribute("rowspan", x)
                    if parseInt(j) == rowAttrs.length-1 and colAttrs.length !=0
                        th.setAttribute("colspan",2)
                    tr.appendChild th
            for own j, colKey of colKeys #this is the tight loop
                aggregator = pivotData.getAggregator(rowKey, colKey)
                val = aggregator.value()
                td = document.createElement("td")
                td.className = "pvtVal row#{i} col#{j}"
                td.textContent = aggregator.format(val)
                td.setAttribute("data-value", val)
                if getClickHandler?
                    td.onclick = getClickHandler(val, rowKey, colKey)
                tr.appendChild td

            if opts.table.rowTotals || colAttrs.length == 0
                totalAggregator = pivotData.getAggregator(rowKey, [])
                val = totalAggregator.value()
                td = document.createElement("td")
                td.className = "pvtTotal rowTotal"
                td.textContent = totalAggregator.format(val)
                td.setAttribute("data-value", val)
                if getClickHandler?
                    td.onclick = getClickHandler(val, rowKey, [])
                td.setAttribute("data-for", "row"+i)
                tr.appendChild td
            tbody.appendChild tr

        #finally, the row for col totals, and a grand total
        if opts.table.colTotals || rowAttrs.length == 0
            tr = document.createElement("tr")
            if opts.table.colTotals || rowAttrs.length == 0
                th = document.createElement("th")
                th.className = "pvtTotalLabel pvtColTotalLabel"
                th.innerHTML = opts.localeStrings.totals
                th.setAttribute("colspan", rowAttrs.length + (if colAttrs.length == 0 then 0 else 1))
                tr.appendChild th
            for own j, colKey of colKeys
                totalAggregator = pivotData.getAggregator([], colKey)
                val = totalAggregator.value()
                td = document.createElement("td")
                td.className = "pvtTotal colTotal"
                td.textContent = totalAggregator.format(val)
                td.setAttribute("data-value", val)
                if getClickHandler?
                    td.onclick = getClickHandler(val, [], colKey)
                td.setAttribute("data-for", "col"+j)
                tr.appendChild td
            if opts.table.rowTotals || colAttrs.length == 0
                totalAggregator = pivotData.getAggregator([], [])
                val = totalAggregator.value()
                td = document.createElement("td")
                td.className = "pvtGrandTotal"
                td.textContent = totalAggregator.format(val)
                td.setAttribute("data-value", val)
                if getClickHandler?
                    td.onclick = getClickHandler(val, [], [])
                tr.appendChild td
            tbody.appendChild tr
        result.appendChild tbody

        callLifecycle('render-completed', 100, {
            totalRows: rowKeys.length
            totalCols: colKeys.length
            domElements: result.querySelectorAll('*').length
        })

        return result

    ###
    Pivot Table core: create PivotData object and call Renderer on it
    ###

    $.fn.pivot = (input, inputOpts, locale="en") ->
        locale = "en" if not locales[locale]?
        defaults =
            cols : [], rows: [], vals: []
            rowOrder: "key_a_to_z", colOrder: "key_a_to_z"
            dataClass: PivotData
            filter: -> true
            aggregator: aggregatorTemplates.count()()
            aggregatorName: "Count"
            sorters: {}
            labels: {}
            derivedAttributes: {}
            renderer: pivotTableRenderer
            asyncMode: false

        localeStrings = $.extend(true, {}, locales.en.localeStrings, locales[locale].localeStrings)
        localeDefaults =
            rendererOptions: {
                localeSettings: localeStrings,
                labels: {},
                table: {
                    virtualization: {
                        enabled: false
                    }
                },
                progressInterval: 1000,
                renderChunkSize: 25,
                lifecycleCallback: null
            }
            localeStrings: localeStrings

        opts = $.extend(true, {}, localeDefaults, $.extend({}, defaults, inputOpts))

        # Передаем ссылку на элемент для автоопределения высоты
        opts.rendererOptions.pivotUIElement = x

        x = this[0]

        if opts.asyncMode
            # Async mode - return promise
            return new Promise (resolve, reject) =>
                x.removeChild(x.lastChild) while x.hasChildNodes()

                # Show loading indicator
                loadingDiv = document.createElement("div")
                loadingDiv.className = "pvt-loading"
                loadingDiv.innerHTML = "Processing data..."
                x.appendChild(loadingDiv)

                try
                    pivotData = new opts.dataClass(input, opts)

                    # Store instance for abort functionality
                    x.pivotDataInstance = pivotData

                    # Wait for async data processing to complete
                    checkDataReady = =>
                        if pivotData.dataReady or pivotData.aborted
                            if pivotData.aborted
                                reject(new Error("Processing aborted"))
                                return

                            try
                                # Check if this is a table renderer
                                # Can be: direct function reference, string "Table", or resolved function from renderers dict
                                rendererFunction = opts.renderer
                                rendererName = null

                                # If renderer is a string, resolve it to function
                                if typeof opts.renderer == "string"
                                    rendererName = opts.renderer
                                    rendererFunction = opts.renderers?[opts.renderer] or renderers[opts.renderer]
                                else if $.isFunction(opts.renderer)
                                    # Try to find the renderer name by comparing functions
                                    for name, func of (opts.renderers or renderers)
                                        if func == opts.renderer
                                            rendererName = name
                                            break

                                # Check if this is a table renderer
                                isTableRenderer = (rendererFunction == pivotTableRenderer) or
                                                 (rendererName == "Table") or
                                                 ($.isFunction(rendererFunction) and rendererFunction.toString().indexOf("pivotTableRenderer") > -1)

                                if isTableRenderer
                                    # Use async renderer for table
                                    pivotTableRendererAsync(pivotData, opts.rendererOptions)
                                        .then (result) =>
                                            x.removeChild(x.lastChild) while x.hasChildNodes()
                                            x.appendChild(result)
                                            resolve(result)
                                        .catch (error) =>
                                            reject(error)
                                else
                                    # Use regular renderer but wrapped in async chunks
                                    setTimeout =>
                                        try
                                            # Break sync renderer into chunks too
                                            renderSyncInChunks = ->
                                                setTimeout =>
                                                    try
                                                        result = opts.renderer(pivotData, opts.rendererOptions)
                                                        x.removeChild(x.lastChild) while x.hasChildNodes()
                                                        x.appendChild(result)
                                                        resolve(result)
                                                    catch error
                                                        reject(error)
                                                , 1 # Small delay to allow UI updates

                                            renderSyncInChunks()
                                        catch error
                                            reject(error)
                                    , 1
                            catch e
                                console.error(e.stack) if console?
                                reject(e)
                        else
                            setTimeout(checkDataReady, 100)

                    checkDataReady()

                catch e
                    console.error(e.stack) if console?
                    reject(e)
        else
            # Sync mode - original behavior
            result = null
            try
                pivotData = new opts.dataClass(input, opts)
                try
                    result = opts.renderer(pivotData, opts.rendererOptions)
                catch e
                    console.error(e.stack) if console?
                    result = $("<span>").html opts.localeStrings.renderError
            catch e
                console.error(e.stack) if console?
                result = $("<span>").html opts.localeStrings.computeError

            x.removeChild(x.lastChild) while x.hasChildNodes()
            x.appendChild(result) if result
            return this


    ###
    Pivot Table UI: calls Pivot Table core above with options set by user
    ###

    $.fn.pivotUI = (input, inputOpts, overwrite = false, locale="en") ->
        locale = "en" if not locales[locale]?
        defaults =
            derivedAttributes: {}
            aggregators: locales[locale].aggregators
            renderers: locales[locale].renderers
            hiddenAttributes: []
            hiddenFromAggregators: []
            hiddenFromDragDrop: []
            menuLimit: 500
            cols: [], rows: [], vals: []
            rowOrder: "key_a_to_z", colOrder: "key_a_to_z"
            dataClass: PivotData
            exclusions: {}
            inclusions: {}
            unusedAttrsVertical: 85
            autoSortUnusedAttrs: false
            onRefresh: null
            complexityCallback: null #callback to check if computation should proceed based on complexity heuristics
            showUI: true
            labels: {}
            controls: {
                unused: false
                rules: false
            }
            filter: -> true
            sorters: {}
            asyncMode: false

        localeStrings = $.extend(true, {}, locales.en.localeStrings, locales[locale].localeStrings)
        localeDefaults =
            rendererOptions: {
                localeStrings,
                lifecycleCallback: null
                progressInterval: 1000
                renderChunkSize: 25
                table: {
                    virtualization: {
                        autoHeight: false  # Автоматически определять высоту на основе pvtUi
                    }
                }
            }
            localeStrings: localeStrings

        existingOpts = @data "pivotUIOptions"
        if not existingOpts? or overwrite
            opts = $.extend(true, {}, localeDefaults, $.extend({}, defaults, inputOpts))
        else
            opts = existingOpts

        try
            # do a first pass on the data to cache a materialized copy of any
            # function-valued inputs and to compute dimension cardinalities
            attrValues = {}
            materializedInput = []
            recordsProcessed = 0
            PivotData.forEachRecord input, opts.derivedAttributes, (record) ->
                return unless opts.filter(record)
                materializedInput.push(record)
                for own attr of record
                    if not attrValues[attr]?
                        attrValues[attr] = {}
                        if recordsProcessed > 0
                            attrValues[attr]["null"] = recordsProcessed
                for attr of attrValues
                    value = record[attr] ? "null"
                    attrValues[attr][value] ?= 0
                    attrValues[attr][value]++
                recordsProcessed++

            #start building the output
            uiTable = $("<table>", class: "pvtUi").attr("cellpadding", 5)

            #renderer control
            rendererControl = $("<td>", colspan: "3", class: "pvtUiCell pvtUiControls")

            renderer = $("<select>")
                .addClass("pvtRenderer")
                .appendTo(rendererControl)
                .bind "change", -> refresh() #capture reference
            for own x of opts.renderers
                $("<option>").val(x).html(x).appendTo(renderer)


            #axis list, including the double-click menu
            unused = $("<td>", class: "pvtAxisContainer pvtUnused pvtUiCell")
            shownAttributes = (a for a of attrValues when a not in opts.hiddenAttributes)
            shownInAggregators = (c for c in shownAttributes when c not in opts.hiddenFromAggregators)
            shownInDragDrop = (c for c in shownAttributes when c not in opts.hiddenFromDragDrop)

            unusedAttrsVerticalAutoOverride = true

            if opts.unusedAttrsVertical == true or unusedAttrsVerticalAutoOverride
                unused.addClass('pvtVertList')
            else
                unused.addClass('pvtHorizList')

            for own i, attr of shownInDragDrop
                do (attr) ->
                    values = (v for v of attrValues[attr])
                    hasExcludedItem = false
                    valueList = $("<div>", class: "pvtFilterBox panel panel-default").hide()
                    valueHeading = $("<div>", class: "panel-heading")
                    valueBody = $("<div>", class: "panel-body")
                    valueFooter = $("<div>", class: "panel-footer")

                    valueList.append valueHeading
                    valueList.append valueBody
                    valueList.append valueFooter

                    valueHeading.append $("<h4>", class: "panel-title").append(
                        $("<span>").text(opts.labels[attr] ? attr),
                        $("<span>").addClass("count").text("(#{values.length})"),
                    )

                    if values.length > opts.menuLimit
                        valueList.append $("<p>").html(opts.localeStrings.tooMany)
                    else
                        if values.length > 5
                            controls = $("<div>", class: "input-group").appendTo(valueBody)
                            sorter = getSort(opts.sorters, attr)
                            placeholder = opts.localeStrings.filterResults
                            $("<input>").appendTo(controls)
                                .attr({placeholder: placeholder, class: "pvtSearch form-control input-sm", type: "text"})
                                .bind "keyup", ->
                                    filter = $(this).val().toLowerCase().trim()
                                    accept_gen = (prefix, accepted) -> (v) ->
                                        real_filter = filter.substring(prefix.length).trim()
                                        return true if real_filter.length == 0
                                        return Math.sign(sorter(v.toLowerCase(), real_filter)) in accepted
                                    accept =
                                        if      filter.indexOf(">=") == 0 then accept_gen(">=", [1,0])
                                        else if filter.indexOf("<=") == 0 then accept_gen("<=", [-1,0])
                                        else if filter.indexOf(">") == 0  then accept_gen(">",  [1])
                                        else if filter.indexOf("<") == 0  then accept_gen("<",  [-1])
                                        else if filter.indexOf("~") == 0  then (v) ->
                                                return true if filter.substring(1).trim().length == 0
                                                v.toLowerCase().match(filter.substring(1))
                                        else (v) -> v.toLowerCase().indexOf(filter) != -1

                                    valueList.find('.pvtCheckContainer label span.value').each ->
                                        if accept($(this).text())
                                            $(this).parent().parent().addClass('pvtFilterIn').show()
                                        else
                                            $(this).parent().parent().removeClass("pvtFilterIn").hide()
                            controlsButtons = $("<span>", class: "input-group-btn").appendTo(controls)
                            $("<button>", type: "button", class: "btn btn-default btn-sm", title: opts.localeStrings.selectAll).appendTo(controlsButtons)
                                .append($("<i>", class: "far fa-fw fa-check-square"))
                                .bind "click", ->
                                    valueList.find("input:visible:not(:checked)")
                                        .prop("checked", true).toggleClass("changed")
                                    return false
                            $("<button>", type:"button", class: "btn btn-default btn-sm", title: opts.localeStrings.selectNone).appendTo(controlsButtons)
                                .append($("<i>", class: "far fa-fw fa-square"))
                                .bind "click", ->
                                    valueList.find("input:visible:checked")
                                        .prop("checked", false).toggleClass("changed")
                                    return false

                        checkContainer = $("<div>", class: "pvtCheckContainer").appendTo(valueBody)

                        for value in values.sort(getSort(opts.sorters, attr))
                             valueCount = attrValues[attr][value]
                             filterItem = $("<label>")
                             filterItemExcluded = false
                             if opts.inclusions[attr]
                                filterItemExcluded = (value not in opts.inclusions[attr])
                             else if opts.exclusions[attr]
                                filterItemExcluded = (value in opts.exclusions[attr])
                             hasExcludedItem ||= filterItemExcluded
                             $("<input>")
                                .attr("type", "checkbox").addClass('pvtFilter')
                                .attr("checked", !filterItemExcluded).data("filter", [attr,value])
                                .appendTo(filterItem)
                                .bind "change", -> $(this).toggleClass("changed")
                             filterItem.append $("<span>").addClass("value").text(value)
                             filterItem.append $("<span>").addClass("count").text("("+valueCount+")")
                             checkContainer.append $("<div>", class: "checkbox").append(filterItem)

                    closeFilterBox = ->
                        if valueList.find("[type='checkbox']").length >
                               valueList.find("[type='checkbox']:checked").length
                                attrElem.addClass "pvtFilteredAttribute"
                            else
                                attrElem.removeClass "pvtFilteredAttribute"

                            valueList.find('.pvtSearch').val('')
                            valueList.find('.pvtCheckContainer div.checkbox').show()
                            valueList.hide()

                    finalButtons = $("<div>", class: "text-right").appendTo(valueFooter)

                    if values.length <= opts.menuLimit
                        $("<button>", type: "button", class: "btn btn-default btn-sm").text(opts.localeStrings.apply)
                            .appendTo(finalButtons).bind "click", ->
                                if valueList.find(".changed").removeClass("changed").length
                                    refresh()
                                closeFilterBox()
                        $("<span>").html('&nbsp;').appendTo(finalButtons)

                    $("<button>", type: "button", class: "btn btn-default btn-sm").text(opts.localeStrings.cancel)
                        .appendTo(finalButtons).bind "click", ->
                            valueList.find(".changed:checked")
                                .removeClass("changed").prop("checked", false)
                            valueList.find(".changed:not(:checked)")
                                .removeClass("changed").prop("checked", true)
                            closeFilterBox()

                    triangleLink = $("<i>", class: "fas fa-fw fa-caret-down").addClass('pvtTriangle')
                        .bind "click", (e) ->
                            UI = $(".pvtUi")
                            UIHeight = UI.height()
                            UIOffset = UI.offset()
                            targetOffset = $(e.currentTarget).offset()
                            valueListHeight = valueList.height()
                            space = UIHeight - (targetOffset.top - UIOffset.top)

                            if space > valueListHeight
                                top = targetOffset.top - UIOffset.top
                            else if space > valueListHeight / 2
                                top = targetOffset.top - UIOffset.top - valueListHeight / 2
                            else
                                top = targetOffset.top - UIOffset.top - valueListHeight

                            $(".pvtFilterBox").hide()
                            valueList.css(left: targetOffset.left - UIOffset.left + 10, top: top + 10).show()

                    attrElem = $("<li>").addClass("axis_#{i}")
                        .append $("<span>").addClass('label label-default pvtAttr').attr("title", opts.labels[attr] ? attr).text(opts.labels[attr] ? attr).data("attrName", attr).append(triangleLink)

                    attrElem.addClass('pvtFilteredAttribute') if hasExcludedItem
                    unused.append(attrElem)
                    rendererControl.append(valueList)

            tr0 = $("<tr>").appendTo(uiTable)
            tr1 = $("<tr>").appendTo(uiTable)

            #aggregator menu and value area

            aggregator = $("<select>").addClass('pvtAggregator')
                .bind "change", -> refresh() #capture reference
            for own x of opts.aggregators
                aggregator.append $("<option>").val(x).html(x)

            rendererControl
                .append(" ")
                .append(aggregator)

            ordering =
                key_a_to_z:   {rowSymbol: $("<i>", class: "far fa-fw fa-arrows-alt-v"),         colSymbol: $("<i>", class: "far fa-fw fa-arrows-alt-h"),         next: "value_a_to_z"}
                value_a_to_z: {rowSymbol: $("<i>", class: "far fa-fw fa-long-arrow-alt-down"),  colSymbol: $("<i>", class: "far fa-fw fa-long-arrow-alt-right"), next: "value_z_to_a"}
                value_z_to_a: {rowSymbol: $("<i>", class: "far fa-fw fa-long-arrow-alt-up"),    colSymbol: $("<i>", class: "far fa-fw fa-long-arrow-alt-left"),  next: "key_a_to_z"}

            rowOrderArrow = $("<button>", class: "btn btn-default btn-xs")#.addClass("pvtRowOrder")
                .data("order", opts.rowOrder).html(ordering[opts.rowOrder].rowSymbol)
                .bind "click", ->
                    $(this).data("order", ordering[$(this).data("order")].next)
                    $(this).html(ordering[$(this).data("order")].rowSymbol)
                    refresh()

            colOrderArrow = $("<button>", class: "btn btn-default btn-xs")#.addClass("pvtColOrder")
                .data("order", opts.colOrder).html(ordering[opts.colOrder].colSymbol)
                .bind "click", ->
                    $(this).data("order", ordering[$(this).data("order")].next)
                    $(this).html(ordering[$(this).data("order")].colSymbol)
                    refresh()

            orderGroup = $("<div>", class: "btn-group", role: "group")
                .append(rowOrderArrow)
                .append(colOrderArrow)

            unusedVisibility = $("<button>", class: "btn btn-default btn-xs")
                .append($("<i>", class: "far fa-fw fa-ruler-vertical fa-flip-horizontal"))
                .bind "click", ->
                    $(this).toggleClass('active')
                    $(".pvtUnused").toggle()
                    pvtVals = $(".pvtVals")
                    if pvtVals.attr("colspan") == "2"
                        pvtVals.attr("colspan", 1)
                    else
                        pvtVals.attr("colspan", 2)
            unusedVisibility.addClass("active") if opts.controls.unused

            rulesVisibility = $("<button>", class: "btn btn-default btn-xs")
                .append($("<i>", class: "far fa-fw fa-ruler-combined fa-flip-vertical"))
                .bind "click", ->
                    $(this).toggleClass('active')
                    $(".pvtRows, .pvtCols").toggle()
            rulesVisibility.addClass("active") if opts.controls.rules

            panelsGroup = $("<div>", class: "btn-group", role: "group")
                .append(unusedVisibility)
                .append(rulesVisibility)

            # Create refresh button (initially hidden)
            refreshButton = $("<button>", class: "btn btn-default btn-xs pvtRefreshBtn", style: "display: none;")
                .append($("<i>", class: "fas fa-fw fa-sync-alt"))
                .attr("title", "Refresh calculation")
                .bind "click", ->
                    $(this).hide()
                    refresh(false, true) # force refresh

            refreshGroup = $("<div>", class: "btn-group", role: "group")
                .append(refreshButton)

            controlsToolbar = $("<div>", class: "btn-toolbar")
                .append(panelsGroup)
                .append(orderGroup)
                .append(refreshGroup)

            $("<td>", class: "pvtVals pvtUiCell")
              .appendTo(tr1)
              .append(controlsToolbar)

            #column axes
            $("<td>").addClass('pvtAxisContainer pvtHorizList pvtCols pvtUiCell').appendTo(tr1)

            #row axes
            tr2 = $("<tr>").appendTo(uiTable)
            tr2.append $("<td>").addClass('pvtAxisContainer pvtRows pvtUiCell').attr("valign", "top")

            #the actual pivot table container
            pivotTable = $("<td>")
                .attr("valign", "top")
                .addClass('pvtRendererArea')
                .appendTo(tr2)

            #finally the renderer dropdown and unused attribs are inserted at the requested location
            if opts.unusedAttrsVertical == true or unusedAttrsVerticalAutoOverride
                uiTable.find('tr:nth-child(1)').prepend rendererControl
                uiTable.find('tr:nth-child(3)').prepend unused
            else
                uiTable.prepend $("<tr>").append(rendererControl).append(unused)

            #render the UI in its default state
            visible = $("<div>", class: "pvtVisible")
            responsive = $("<div>", class: "pvtResponsive").appendTo(visible)
            uiTable.appendTo(responsive)

            @html visible

            $(".pvtRows, .pvtCols").hide() if !opts.controls.rules
            $(".pvtUnused").hide() if !opts.controls.unused
            $(".pvtVals").attr("colspan", 2) if opts.controls.unused

            #set up the UI initial state as requested by moving elements around

            for x in opts.cols
                @find(".pvtCols").append @find(".axis_#{$.inArray(x, shownInDragDrop)}")
            for x in opts.rows
                @find(".pvtRows").append @find(".axis_#{$.inArray(x, shownInDragDrop)}")
            if opts.aggregatorName?
                @find(".pvtAggregator").val opts.aggregatorName
            if opts.rendererName?
                @find(".pvtRenderer").val opts.rendererName

            @find(".pvtUiCell").hide() unless opts.showUI

            initialRender = true

            #set up for refreshing
            # Function to calculate complexity heuristics
            calculateComplexity = (subopts) =>
                # Count unique values for each attribute
                uniqueValues = {}
                totalRecords = 0

                # Count records and unique values
                PivotData.forEachRecord materializedInput, subopts.derivedAttributes, (record) =>
                    return if not subopts.filter(record)
                    totalRecords++

                    # Count unique values for row attributes
                    for attr in subopts.rows
                        uniqueValues[attr] ?= new Set()
                        uniqueValues[attr].add(record[attr] ? "null")

                    # Count unique values for column attributes
                    for attr in subopts.cols
                        uniqueValues[attr] ?= new Set()
                        uniqueValues[attr].add(record[attr] ? "null")

                # Calculate estimated dimensions
                estimatedRows = 1
                for attr in subopts.rows
                    estimatedRows *= (uniqueValues[attr]?.size || 1)

                estimatedCols = 1
                for attr in subopts.cols
                    estimatedCols *= (uniqueValues[attr]?.size || 1)

                # Calculate complexity score (rough estimate)
                complexityScore = estimatedRows * estimatedCols

                return {
                    totalRecords: totalRecords
                    estimatedRows: estimatedRows
                    estimatedCols: estimatedCols
                    complexityScore: complexityScore
                }

            refreshDelayed = (first, forceRefresh = false) =>
                subopts =
                    derivedAttributes: opts.derivedAttributes
                    localeStrings: opts.localeStrings
                    rendererOptions: opts.rendererOptions
                    sorters: opts.sorters
                    labels: opts.labels
                    cols: [], rows: []
                    dataClass: opts.dataClass
                    asyncMode: opts.asyncMode

                numInputsToProcess = opts.aggregators[aggregator.val()]([])().numInputs ? 0
                vals = []
                @find(".pvtRows li span.pvtAttr").each -> subopts.rows.push $(this).data("attrName")
                @find(".pvtCols li span.pvtAttr").each -> subopts.cols.push $(this).data("attrName")
                @find(".pvtUiControls select.pvtAttrDropdown").each ->
                    if numInputsToProcess == 0
                        $(this).prev(".pvtAttrDropdownBy").remove()
                        $(this).remove()
                    else
                        numInputsToProcess--
                        vals.push $(this).val() if $(this).val() != ""

                if numInputsToProcess != 0
                    pvtUiCell = @find(".pvtUiControls")
                    for x in [0...numInputsToProcess]
                        newDropdown = $("<select>")
                            .addClass('pvtAttrDropdown')
                            .append($("<option>"))
                            .bind "change", -> refresh()
                        for attr in shownInAggregators
                            newDropdown.append($("<option>").val(attr).text(opts.labels[attr] ? attr))
                        pvtUiCell
                            .append(" ")
                            .append($("<span>", class: "pvtAttrDropdownBy").text(localeStrings.by))
                            .append(" ")
                            .append(newDropdown)

                if initialRender
                    vals = opts.vals
                    i = 0
                    @find(".pvtUiControls select.pvtAttrDropdown").each ->
                        $(this).val vals[i]
                        i++
                    initialRender = false

                subopts.aggregatorName = aggregator.val()
                subopts.vals = vals
                subopts.aggregator = opts.aggregators[aggregator.val()](vals)
                subopts.renderer = opts.renderers[renderer.val()]
                subopts.rowOrder = rowOrderArrow.data("order")
                subopts.colOrder = colOrderArrow.data("order")
                
                # Передаем ссылку на UI элемент для автоопределения высоты
                subopts.rendererOptions = $.extend(true, {}, opts.rendererOptions)
                subopts.rendererOptions.pivotUIElement = this[0]
                #construct filter here
                exclusions = {}
                @find('input.pvtFilter').not(':checked').each ->
                    filter = $(this).data("filter")
                    if exclusions[filter[0]]?
                        exclusions[filter[0]].push( filter[1] )
                    else
                        exclusions[filter[0]] = [ filter[1] ]
                #include inclusions when exclusions present
                inclusions = {}
                @find('input.pvtFilter:checked').each ->
                    filter = $(this).data("filter")
                    if exclusions[filter[0]]?
                        if inclusions[filter[0]]?
                            inclusions[filter[0]].push( filter[1] )
                        else
                            inclusions[filter[0]] = [ filter[1] ]

                subopts.filter = (record) ->
                    return false if not opts.filter(record)
                    for k,excludedItems of exclusions
                        return false if ""+(record[k] ? 'null') in excludedItems
                    return true

                # Check complexity before proceeding with calculation
                shouldProceed = true
                if opts.complexityCallback?
                    complexity = calculateComplexity(subopts)
                    # Add forced parameter to callback if this is a forced refresh
                    if forceRefresh
                        # For forced refresh, pass an additional parameter indicating it's forced
                        shouldProceed = opts.complexityCallback(complexity, true)
                    else
                        shouldProceed = opts.complexityCallback(complexity)

                if not shouldProceed
                    # Show refresh button and display message
                    @find(".pvtRefreshBtn").show()
                    pivotTable.html("<div style='text-align: center; padding: 20px; color: #666;'><i class='fas fa-exclamation-triangle'></i><br>Calculation skipped due to complexity.<br>Click refresh button to force calculation.</div>")
                    pivotTable.css("opacity", 1)
                    return

                # Hide refresh button if calculation proceeds
                @find(".pvtRefreshBtn").hide()

                if subopts.asyncMode
                    # Show loading indicator
                    pivotTable.html("<div class='pvt-loading' style='text-align: center; padding: 20px; color: #666;'><i class='fas fa-spinner fa-spin'></i><br>Processing data...</div>")

                    # Store pivot data instance for abort functionality
                    @[0].pivotDataInstance = null

                    pivotPromise = if (["Line Chart", "Bar Chart", "Stacked Bar Chart", "Area Chart", "Scatter Chart", "Pie Chart"].indexOf(renderer.val()) > -1)
                        {result, wrapper} = pivotTable.pivot(materializedInput, subopts)
                        result.then (tableResult) ->
                            wrapper.draw(tableResult)
                            return tableResult
                    else
                        pivotTable.pivot(materializedInput, subopts)

                    if pivotPromise?.then?
                        pivotPromise
                            .then (result) =>
                                @[0].pivotDataInstance = null
                                pivotTable.empty().append(result)

                                pivotUIOptions = $.extend {}, opts,
                                    cols: subopts.cols
                                    rows: subopts.rows
                                    colOrder: subopts.colOrder
                                    rowOrder: subopts.rowOrder
                                    vals: vals
                                    exclusions: exclusions
                                    inclusions: inclusions
                                    inclusionsInfo: inclusions #duplicated for backwards-compatibility
                                    aggregatorName: aggregator.val()
                                    rendererName: renderer.val()

                                @data "pivotUIOptions", pivotUIOptions

                                # if requested make sure unused columns are in alphabetical order
                                if opts.autoSortUnusedAttrs
                                    unusedAttrsContainer = @find("td.pvtUnused.pvtAxisContainer")
                                    $(unusedAttrsContainer).children("li")
                                        .sort((a, b) => naturalSort($(a).text(), $(b).text()))
                                        .appendTo unusedAttrsContainer

                                pivotTable.css("opacity", 1)
                                opts.onRefresh(pivotUIOptions) if opts.onRefresh? and !first?
                            .catch (error) =>
                                @[0].pivotDataInstance = null
                                console.error("Pivot table error:", error)
                                pivotTable.html("<div style='text-align: center; padding: 20px; color: #d9534f;'><i class='fas fa-exclamation-triangle'></i><br>Error processing data:<br>#{error.message}</div>")
                                pivotTable.css("opacity", 1)
                else
                    # Synchronous mode - original behavior
                    if (["Line Chart", "Bar Chart", "Stacked Bar Chart", "Area Chart", "Scatter Chart", "Pie Chart"].indexOf(renderer.val()) > -1)
                        {result, wrapper} = pivotTable.pivot(materializedInput, subopts);
                        pivotTable.append(result)
                        wrapper.draw(result[0])
                    else
                        pivotTable.append(pivotTable.pivot(materializedInput, subopts));

                    pivotUIOptions = $.extend {}, opts,
                        cols: subopts.cols
                        rows: subopts.rows
                        colOrder: subopts.colOrder
                        rowOrder: subopts.rowOrder
                        vals: vals
                        exclusions: exclusions
                        inclusions: inclusions
                        inclusionsInfo: inclusions #duplicated for backwards-compatibility
                        aggregatorName: aggregator.val()
                        rendererName: renderer.val()

                    @data "pivotUIOptions", pivotUIOptions

                    # if requested make sure unused columns are in alphabetical order
                    if opts.autoSortUnusedAttrs
                        unusedAttrsContainer = @find("td.pvtUnused.pvtAxisContainer")
                        $(unusedAttrsContainer).children("li")
                            .sort((a, b) => naturalSort($(a).text(), $(b).text()))
                            .appendTo unusedAttrsContainer

                    pivotTable.css("opacity", 1)
                    opts.onRefresh(pivotUIOptions) if opts.onRefresh? and !first?

            refresh = (first, forceRefresh = false) =>
                pivotTable.css("opacity", 0.5)
                setTimeout ( -> refreshDelayed first, forceRefresh), 10

            #the very first refresh will actually display the table
            refresh(true, false)

            @find(".pvtAxisContainer").sortable
                    update: (e, ui) -> refresh() if not ui.sender?
                    connectWith: @find(".pvtAxisContainer")
                    items: 'li'
                    placeholder: 'pvtPlaceholder'

            # $(".pvtUi .pvtRows, .pvtUi .pvtUnused").resizable({
            #     handles: "e",
            #     resize: (event, ui) ->
            #         if ui.size.width > 150
            #             event.target.style.maxWidth = ui.size.width + 'px'
            # })
        catch e
            console.error(e.stack) if console?
            @html opts.localeStrings.uiRenderError
        return this

    ###
    Heatmap post-processing
    ###

    $.fn.heatmap = (scope = "heatmap", opts) ->
        numRows = @data "numrows"
        numCols = @data "numcols"

        # given a series of values
        # must return a function to map a given value to a CSS color
        colorScaleGenerator = opts?.heatmap?.colorScaleGenerator
        colorScaleGenerator ?= (values) ->
            min = Math.min(values...)
            max = Math.max(values...)
            return (x) ->
                nonRed = 255 - Math.round 255*(x-min)/(max-min)
                return "rgb(255,#{nonRed},#{nonRed})"

        heatmapper = (scope) =>
            forEachCell = (f) =>
                @find(scope).each ->
                    x = $(this).data("value")
                    f(x, $(this)) if x? and isFinite(x)

            values = []
            forEachCell (x) -> values.push x
            colorScale = colorScaleGenerator(values)
            forEachCell (x, elem) -> elem.css "background-color", colorScale(x)

        switch scope
            when "heatmap"    then heatmapper ".pvtVal"
            when "rowheatmap" then heatmapper ".pvtVal.row#{i}" for i in [0...numRows]
            when "colheatmap" then heatmapper ".pvtVal.col#{j}" for j in [0...numCols]

        heatmapper ".pvtTotal.rowTotal"
        heatmapper ".pvtTotal.colTotal"

        return this

    ###
    Barchart post-processing
    ###

    $.fn.barchart = (opts) ->
        numRows = @data "numrows"
        numCols = @data "numcols"

        barcharter = (scope) =>
            forEachCell = (f) =>
                @find(scope).each ->
                    x = $(this).data("value")
                    f(x, $(this)) if x? and isFinite(x)

            values = []
            forEachCell (x) -> values.push x
            max = Math.max(values...)
            if max < 0
                max = 0
            range = max;
            min = Math.min(values...)
            if min < 0
                range = max - min
            scaler = (x) -> 100*x/(1.4*range)
            forEachCell (x, elem) ->
                text = elem.text()
                wrapper = $("<div>").css
                    "position": "relative"
                    "height": "55px"
                bgColor = "gray"
                bBase = 0
                if min < 0
                    bBase = scaler(-min)
                if x < 0
                    bBase += scaler(x)
                    bgColor = "darkred"
                    x = -x
                wrapper.append $("<div>").css
                    "position": "absolute"
                    "bottom": bBase + "%"
                    "left": 0
                    "right": 0
                    "height": scaler(x) + "%"
                    "background-color": bgColor
                wrapper.append $("<div>").text(text).css
                    "position":"relative"
                    "padding-left":"5px"
                    "padding-right":"5px"

                elem.css("padding": 0,"padding-top": "5px", "text-align": "center").html wrapper

        barcharter ".pvtVal.row#{i}" for i in [0...numRows]
        barcharter ".pvtTotal.colTotal"

        return this

    ###
    Virtualized Pivot Table Renderer - оптимизированная версия для больших данных
    ###

    pivotTableRendererVirtualized = (pivotData, opts) ->
        defaults =
            table:
                clickCallback: null
                rowTotals: true
                colTotals: true
                virtualization:
                    enabled: false
                    rowHeight: 30
                    bufferSize: 5  # количество строк буфера сверху и снизу
                    containerHeight: 400  # высота контейнера таблицы
                    autoHeight: false  # Автоматически определять высоту на основе pvtUi
            localeStrings: totals: "Totals"
            lifecycleCallback: null

        opts = $.extend(true, {}, defaults, opts)

        # Автоопределение высоты контейнера
        if opts.table.virtualization.autoHeight
            # Пытаемся найти родительский элемент pvtUi
            pivotUIElement = opts.pivotUIElement
            
            # Если не передан через опции, ищем в DOM
            if not pivotUIElement and typeof $ != 'undefined'
                pivotUIElement = $(".pvtUi").first()[0]
            
            if pivotUIElement
                # Определяем доступную высоту
                pivotUIHeight = pivotUIElement.clientHeight || pivotUIElement.offsetHeight
                
                # Если высота еще не определилась (элемент не отрисован), используем viewport
                if pivotUIHeight <= 0 and typeof window != 'undefined'
                    pivotUIHeight = window.innerHeight || 600
                
                # Находим таблицу внутри UI для более точного расчета
                pivotTableElement = null
                if typeof $ != 'undefined'
                    pivotTableElement = $(pivotUIElement).find('.pvtTable, .pvtRendererArea').first()[0]
                
                if pivotTableElement
                    # Определяем высоту области для таблицы
                    if pivotTableElement.getBoundingClientRect
                        tableAreaTop = pivotTableElement.getBoundingClientRect().top || 0
                        uiAreaTop = if pivotUIElement.getBoundingClientRect then pivotUIElement.getBoundingClientRect().top else 0
                        usedHeight = tableAreaTop - uiAreaTop + 50 # добавляем отступ
                    else
                        usedHeight = 120
                else
                    # Приблизительный расчет: контролы + отступы
                    usedHeight = 120
                
                # Вычисляем доступную высоту
                availableHeight = Math.max(200, pivotUIHeight - usedHeight)
                opts.table.virtualization.containerHeight = availableHeight

        aborted = false
        startTime = Date.now()

        callLifecycle = (stage, progress, metadata = null) ->
            return unless opts.lifecycleCallback?

            data = {
                stage: stage
                progress: progress
                elapsedTime: Date.now() - startTime
                totalRows: metadata?.totalRows
                totalCols: metadata?.totalCols
                isVirtualized: true
                domElements: metadata?.domElements
                currentIndex: metadata?.currentIndex
                endIndex: metadata?.endIndex
            }

            abortFn = null
            if stage in ['render-started', 'render-progress']
                abortFn = -> aborted = true

            toggleVirtualizationFn = null
            if stage in ['render-started']
                toggleVirtualizationFn = (enabled) ->
                    opts.table.virtualization.enabled = enabled

            opts.lifecycleCallback(data, abortFn, toggleVirtualizationFn)

        colAttrs = pivotData.colAttrs
        rowAttrs = pivotData.rowAttrs
        rowKeys = pivotData.getRowKeys()
        colKeys = pivotData.getColKeys()

        totalRows = rowKeys.length
        callLifecycle('render-started', 0, {
            totalRows: totalRows
            totalCols: colKeys.length
            domElements: 0
        })
        return if aborted

        shouldVirtualize = opts.table.virtualization.enabled

        if not shouldVirtualize
            return pivotTableRenderer(pivotData, opts)

        container = document.createElement("div")
        container.className = "pvt-virtualized-container"
        container.style.cssText = """
            position: relative;
            height: #{opts.table.virtualization.containerHeight}px;
            overflow: auto;
            border: 1px solid #ccc;
            background: white;
        """

        mainTable = document.createElement("table")
        mainTable.className = "pvtTable pvt-virtualized-table"

        container.appendChild(mainTable)

        # Variables for synchronizing column widths
        columnWidths = []
        totalColumns = 0
        isUpdatingRows = false  # Flag to prevent update conflicts
        columnWidthsMeasured = false  # Flag to measure widths only once

        if opts.table.clickCallback
            getClickHandler = (value, rowValues, colValues) ->
                filters = {}
                filters[attr] = colValues[i] for own i, attr of colAttrs when colValues[i]?
                filters[attr] = rowValues[i] for own i, attr of rowAttrs when rowValues[i]?
                return (e) -> opts.table.clickCallback(e, value, filters, pivotData)

        spanSize = (arr, i, j) ->
            if i != 0
                noDraw = true
                for x in [0..j]
                    if arr[i-1][x] != arr[i][x]
                        noDraw = false
                if noDraw
                    return -1
            len = 0
            while i+len < arr.length
                stop = false
                for x in [0..j]
                    stop = true if arr[i][x] != arr[i+len][x]
                break if stop
                len++
            return len

        calculateTotalColumns = ->
            totalCols = rowAttrs.length
            if colAttrs.length > 0
                totalCols += 1 # for "attribute" column
            totalCols += colKeys.length # for data column
            if opts.table.rowTotals
                totalCols += 1 # total column
            return totalCols

        measureAndApplyColumnWidths = ->
            # Measure widths only once to avoid accumulating changes
            return if columnWidthsMeasured

            # Find a data row for measurement (not a spacer)
            dataRow = mainTable.querySelector('tbody tr:not(.pvt-virtual-spacer-top):not(.pvt-virtual-spacer-bottom)')
            return unless dataRow

            cells = dataRow.querySelectorAll('th, td')
            return if cells.length == 0

            # Measure the natural width of each cell (without forcing the width)
            newColumnWidths = []
            for cell, i in cells
                # Temporarily remove set widths to get the natural size
                originalStyle = cell.style.cssText
                cell.style.width = 'auto'
                cell.style.minWidth = 'auto'
                cell.style.maxWidth = 'none'

                rect = cell.getBoundingClientRect()
                width = Math.max(rect.width, 80) # min 80px
                newColumnWidths.push(width)

                # Restore the style
                cell.style.cssText = originalStyle

            columnWidths = newColumnWidths
            columnWidthsMeasured = true

            applyWidthsToAllSections()

        # Function to apply already measured column widths to new rows
        applyExistingColumnWidths = ->
            return if columnWidths.length == 0
            applyWidthsToDataRows()

        # Apply widths to all sections of the table
        applyWidthsToAllSections = ->
            return if columnWidths.length == 0

            applyWidthsToHeaders()
            applyWidthsToFooter()
            applyWidthsToDataRows()

        applyWidthsToDataRows = ->
            return if columnWidths.length == 0

            dataRows = mainTable.querySelectorAll('tbody tr:not(.pvt-virtual-spacer-top):not(.pvt-virtual-spacer-bottom)')
            for dataRow in dataRows
                cells = dataRow.querySelectorAll('th, td')
                for cell, i in cells
                    if columnWidths[i]?
                        cell.style.width = "#{columnWidths[i]}px"
                        cell.style.minWidth = "#{columnWidths[i]}px"
                        cell.style.maxWidth = "#{columnWidths[i]}px"

        applyWidthsToHeaders = ->
            return if columnWidths.length == 0

            # Data columns struct: [rowHeaders...] [dataColumns...] [totalColumn?]
            numRowHeaders = rowAttrs.length
            numDataColumns = colKeys.length
            hasTotalColumn = opts.table.rowTotals || colAttrs.length == 0

            # Apply to headers row by row
            headerRows = mainTable.querySelectorAll('thead tr')
            for headerRow, rowIndex in headerRows
                cells = headerRow.querySelectorAll('th')
                dataColumnIndex = 0  # Index in columnWidths array

                for cell, cellIndex in cells
                    colspan = parseInt(cell.getAttribute('colspan')) || 1

                    if cellIndex == 0 and colspan == numRowHeaders and rowIndex == 0
                        # First merged cell for row headers
                        totalRowHeaderWidth = 0
                        for i in [0...numRowHeaders]
                            totalRowHeaderWidth += columnWidths[i] || 100
                        cell.style.width = "#{totalRowHeaderWidth}px"
                        cell.style.minWidth = "#{totalRowHeaderWidth}px"
                        cell.style.maxWidth = "#{totalRowHeaderWidth}px"

                    else if cell.classList.contains('pvtAxisLabel')
                        if dataColumnIndex < numRowHeaders
                            # Column rows attributes
                            width = columnWidths[dataColumnIndex] || 100
                            cell.style.width = "#{width}px"
                            cell.style.minWidth = "#{width}px"
                            cell.style.maxWidth = "#{width}px"
                            dataColumnIndex++
                        else
                            # Column attribute header - spans all data columns
                            totalDataWidth = 0
                            for i in [numRowHeaders...numRowHeaders + numDataColumns]
                                totalDataWidth += columnWidths[i] || 80
                            cell.style.width = "#{totalDataWidth}px"
                            cell.style.minWidth = "#{totalDataWidth}px"
                            cell.style.maxWidth = "#{totalDataWidth}px"

                    else if cell.classList.contains('pvtColLabel')
                        # Data column headers
                        actualColumnIndex = numRowHeaders + dataColumnIndex
                        if colspan == 1
                            width = columnWidths[actualColumnIndex] || 80
                            cell.style.width = "#{width}px"
                            cell.style.minWidth = "#{width}px"
                            cell.style.maxWidth = "#{width}px"
                            dataColumnIndex++
                        else
                            # Merged cell for data columns
                            totalWidth = 0
                            for i in [0...colspan]
                                totalWidth += columnWidths[actualColumnIndex + i] || 80
                            cell.style.width = "#{totalWidth}px"
                            cell.style.minWidth = "#{totalWidth}px"
                            cell.style.maxWidth = "#{totalWidth}px"
                            dataColumnIndex += colspan

                    else if cell.classList.contains('pvtTotalLabel')
                        if hasTotalColumn
                            totalColumnIndex = numRowHeaders + numDataColumns
                            width = columnWidths[totalColumnIndex] || 80
                            cell.style.width = "#{width}px"
                            cell.style.minWidth = "#{width}px"
                            cell.style.maxWidth = "#{width}px"

        # Applying widths to the totals row in tfoot - matches the data structure exactly
        applyWidthsToFooter = ->
            return if columnWidths.length == 0

            footerRow = mainTable.querySelector('tfoot tr')
            return unless footerRow

            cells = footerRow.querySelectorAll('th, td')

            for cell, i in cells
                if columnWidths[i]?
                    cell.style.width = "#{columnWidths[i]}px"
                    cell.style.minWidth = "#{columnWidths[i]}px"
                    cell.style.maxWidth = "#{columnWidths[i]}px"

        buildHeaders = ->
            thead = document.createElement("thead")

            for own j, c of colAttrs
                tr = document.createElement("tr")

                if parseInt(j) == 0 and rowAttrs.length != 0
                    th = document.createElement("th")
                    th.setAttribute("colspan", rowAttrs.length)
                    th.setAttribute("rowspan", colAttrs.length)
                    th.style.cssText = "background: #f5f5f5; border: 1px solid #ccc; padding: 5px; text-align: center; font-weight: bold; white-space: nowrap;"
                    tr.appendChild th

                th = document.createElement("th")
                th.className = "pvtAxisLabel"
                th.textContent = opts.labels?[c] ? c
                th.style.cssText = "background: #f5f5f5; border: 1px solid #ccc; padding: 5px; text-align: center; font-weight: bold; white-space: nowrap;"
                tr.appendChild th

                for own i, colKey of colKeys
                    x = spanSize(colKeys, parseInt(i), parseInt(j))
                    if x != -1
                        th = document.createElement("th")
                        th.className = "pvtColLabel"
                        th.textContent = colKey[j]
                        th.setAttribute("colspan", x)
                        th.style.cssText = "background: #f0f0f0; border: 1px solid #ccc; padding: 5px; text-align: center; white-space: nowrap; min-width: 80px;"
                        if parseInt(j) == colAttrs.length-1 and rowAttrs.length != 0
                            th.setAttribute("rowspan", 2)
                        tr.appendChild th

                if parseInt(j) == 0 && opts.table.rowTotals
                    th = document.createElement("th")
                    th.className = "pvtTotalLabel pvtRowTotalLabel"
                    th.innerHTML = opts.localeStrings.totals
                    th.setAttribute("rowspan", colAttrs.length + (if rowAttrs.length == 0 then 0 else 1))
                    th.style.cssText = "background: #e6e6e6; border: 1px solid #ccc; padding: 5px; text-align: center; font-weight: bold; white-space: nowrap; min-width: 80px;"
                    tr.appendChild th

                thead.appendChild tr

            if rowAttrs.length != 0
                tr = document.createElement("tr")

                for own i, r of rowAttrs
                    th = document.createElement("th")
                    th.className = "pvtAxisLabel"
                    th.textContent = opts.labels?[r] ? r
                    th.style.cssText = "background: #f5f5f5; border: 1px solid #ccc; padding: 5px; text-align: center; font-weight: bold; white-space: nowrap; min-width: 100px;"
                    tr.appendChild th

                th = document.createElement("th")
                if colAttrs.length == 0
                    th.className = "pvtTotalLabel pvtRowTotalLabel"
                    th.innerHTML = opts.localeStrings.totals
                th.style.cssText = "border: 1px solid #ccc; padding: 5px; text-align: center; white-space: nowrap;"
                tr.appendChild th
                thead.appendChild tr

            mainTable.appendChild thead

        buildFooter = ->
            return unless opts.table.colTotals || rowAttrs.length == 0

            tfoot = document.createElement("tfoot")
            tr = document.createElement("tr")
            tr.className = "pvt-totals-row"
            tr.style.cssText = "background: #f9f9f9; border-top: 2px solid #999; font-weight: bold;"

            if opts.table.colTotals || rowAttrs.length == 0
                th = document.createElement("th")
                th.className = "pvtTotalLabel pvtColTotalLabel"
                th.innerHTML = opts.localeStrings.totals
                th.setAttribute("colspan", rowAttrs.length + (if colAttrs.length == 0 then 0 else 1))
                th.style.cssText = "background: #e6e6e6; border: 1px solid #ccc; padding: 5px; text-align: center; font-weight: bold; white-space: nowrap;"
                tr.appendChild th

            for own j, colKey of colKeys
                totalAggregator = pivotData.getAggregator([], colKey)
                val = totalAggregator.value()
                td = document.createElement("td")
                td.className = "pvtTotal colTotal"
                td.textContent = totalAggregator.format(val)
                td.setAttribute("data-value", val)
                td.style.cssText = "border: 1px solid #ccc; padding: 5px; text-align: right; font-weight: bold; background: #f9f9f9; color: #000; white-space: nowrap; min-width: 80px;"
                if getClickHandler?
                    td.onclick = getClickHandler(val, [], colKey)
                td.setAttribute("data-for", "col"+j)
                tr.appendChild td

            if opts.table.rowTotals || colAttrs.length == 0
                totalAggregator = pivotData.getAggregator([], [])
                val = totalAggregator.value()
                td = document.createElement("td")
                td.className = "pvtGrandTotal"
                td.textContent = totalAggregator.format(val)
                td.setAttribute("data-value", val)
                td.style.cssText = "border: 1px solid #ccc; padding: 5px; text-align: right; font-weight: bold; background: #e6e6e6; color: #000; white-space: nowrap; min-width: 80px;"
                if getClickHandler?
                    td.onclick = getClickHandler(val, [], [])
                tr.appendChild td

            tfoot.appendChild tr
            mainTable.appendChild tfoot

        createDataRow = (i, rowKey) ->
            tr = document.createElement("tr")
            tr.setAttribute("data-row-index", i)
            tr.style.height = "#{opts.table.virtualization.rowHeight}px"

            for own j, txt of rowKey
                x = spanSize(rowKeys, parseInt(i), parseInt(j))
                if x != -1
                    th = document.createElement("th")
                    th.className = "pvtRowLabel"
                    th.textContent = txt
                    th.setAttribute("rowspan", x)
                    th.style.cssText = "background: #f8f8f8; border: 1px solid #ccc; padding: 5px; text-align: left; font-weight: normal; white-space: nowrap; min-width: 100px;"
                    if parseInt(j) == rowAttrs.length-1 and colAttrs.length != 0
                        th.setAttribute("colspan", 2)
                    tr.appendChild th

            for own j, colKey of colKeys
                aggregator = pivotData.getAggregator(rowKey, colKey)
                val = aggregator.value()
                td = document.createElement("td")
                td.className = "pvtVal row#{i} col#{j}"
                td.textContent = aggregator.format(val)
                td.setAttribute("data-value", val)
                td.style.cssText = "border: 1px solid #ccc; padding: 5px; text-align: right; color: #3D3D3D; white-space: nowrap; min-width: 80px;"
                if getClickHandler?
                    td.onclick = getClickHandler(val, rowKey, colKey)
                tr.appendChild td

            if opts.table.rowTotals || colAttrs.length == 0
                totalAggregator = pivotData.getAggregator(rowKey, [])
                val = totalAggregator.value()
                td = document.createElement("td")
                td.className = "pvtTotal rowTotal"
                td.textContent = totalAggregator.format(val)
                td.setAttribute("data-value", val)
                td.style.cssText = "border: 1px solid #ccc; padding: 5px; text-align: right; font-weight: bold; background: #f9f9f9; color: #000; white-space: nowrap; min-width: 80px;"
                if getClickHandler?
                    td.onclick = getClickHandler(val, rowKey, [])
                td.setAttribute("data-for", "row#{i}")
                tr.appendChild td

            return tr

        currentStartIndex = 0
        currentEndIndex = 0

        calculateVisibleRange = ->
            scrollTop = container.scrollTop
            containerHeight = opts.table.virtualization.containerHeight
            rowHeight = opts.table.virtualization.rowHeight
            bufferSize = opts.table.virtualization.bufferSize

            headerHeight = mainTable.querySelector('thead')?.clientHeight || 0
            adjustedScrollTop = Math.max(0, scrollTop - headerHeight)

            startIndex = Math.max(0, Math.floor(adjustedScrollTop / rowHeight) - bufferSize)
            visibleRows = Math.ceil((containerHeight - headerHeight) / rowHeight) + (2 * bufferSize)
            endIndex = Math.min(totalRows, startIndex + visibleRows)

            # Boundary check to prevent jitter
            maxScrollTop = Math.max(0, (totalRows * rowHeight) - (containerHeight - headerHeight))
            if scrollTop >= maxScrollTop
                # If reached the end, fix endIndex at the maximum value
                endIndex = totalRows
                startIndex = Math.max(0, endIndex - visibleRows + bufferSize)

            return {startIndex, endIndex}

        updateVisibleRows = ->
            return if isUpdatingRows

            {startIndex, endIndex} = calculateVisibleRange()
            return if startIndex == currentStartIndex and endIndex == currentEndIndex

            isUpdatingRows = true

            callLifecycle('render-progress', (endIndex / totalRows) * 100, {
                totalRows: totalRows
                totalCols: colKeys.length
                domElements: container.querySelectorAll('*').length
                currentIndex: startIndex
                endIndex: endIndex
            })
            # console.log("Virtualization: showing rows #{startIndex}-#{endIndex} of #{totalRows} total")

            tbody = mainTable.querySelector('tbody')
            if not tbody
                tbody = document.createElement('tbody')
                mainTable.appendChild(tbody)

            tbody.innerHTML = ''
            rowHeight = opts.table.virtualization.rowHeight

            if startIndex > 0
                topSpacer = document.createElement('tr')
                topSpacer.className = 'pvt-virtual-spacer-top'
                spacerTd = document.createElement('td')
                spacerTd.style.cssText = """
                    height: #{startIndex * rowHeight}px;
                    padding: 0;
                    border: none;
                    background: transparent;
                """
                spacerTd.setAttribute('colspan', '999')
                topSpacer.appendChild(spacerTd)
                tbody.appendChild(topSpacer)

            for i in [startIndex...endIndex]
                if i < rowKeys.length
                    rowKey = rowKeys[i]
                    row = createDataRow(i, rowKey)
                    tbody.appendChild(row)

            remainingRows = totalRows - endIndex
            if remainingRows > 0
                bottomSpacer = document.createElement('tr')
                bottomSpacer.className = 'pvt-virtual-spacer-bottom'
                spacerTd = document.createElement('td')
                spacerTd.style.cssText = """
                    height: #{remainingRows * rowHeight}px;
                    padding: 0;
                    border: none;
                    background: transparent;
                """
                spacerTd.setAttribute('colspan', '999')
                bottomSpacer.appendChild(spacerTd)
                tbody.appendChild(bottomSpacer)

            currentStartIndex = startIndex
            currentEndIndex = endIndex

            # Measure and apply column widths only during the first render
            if not columnWidthsMeasured
                setTimeout(->
                    measureAndApplyColumnWidths()
                    isUpdatingRows = false
                , 10)
            else
                # Apply already measured column widths to new rows
                setTimeout(->
                    applyExistingColumnWidths()
                    isUpdatingRows = false
                , 5)

        setupScrollHandler = ->
            scrollTimeout = null

            container.addEventListener 'scroll', ->
                clearTimeout(scrollTimeout) if scrollTimeout
                scrollTimeout = setTimeout(updateVisibleRows, 16) # ~60fps

        tbody = document.createElement('tbody')
        mainTable.appendChild(tbody)

        totalColumns = calculateTotalColumns()
        buildHeaders()

        # Add totals to the footer of the main table
        if opts.table.colTotals
            buildFooter()

        setupScrollHandler()
        updateVisibleRows()

        callLifecycle('render-completed', 100, {
            totalRows: rowKeys.length
            totalCols: colKeys.length
            isVirtualized: shouldVirtualize
            domElements: container.querySelectorAll('*').length
        })

        return container
