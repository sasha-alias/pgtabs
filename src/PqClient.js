var PQ = require('libpq');


var Client = function(connstr){
    var self = this;

    // connection string
    this.connstr = connstr;
    this._connstr = normalizeConnstr(connstr);

    // libpq instance
    this.pq = new PQ();

    this.callback = null;

    this.err_callback = null;

    this.finished = false;

    this.error = false;

    this.Responce = null;

    this.cancel = function(){
        return self.pq.cancel();
    };

    this.raiseError = function(err){
        self.error = true;
        self.finished = true;
        //self.pq.removeListener('readable', self.readyHandler);
        self.pq.stopReader();
        self.err_callback(err);
    };

    // send query for execution
    this.sendQuery = function(query, callback, err_callback){
        self.Responce = new Responce();
        self.finished = false;
        self.error = false;

        self.callback = callback;
        self.err_callback = err_callback;

        self.pq.connect(self._connstr, function(err) {
            if (err){
                console.log('Connection error: '+err);
                return self.raiseError(err);
            }

            self.pq.addListener('readable', self.readyHandler);
            var sent = self.pq.sendQuery(query);

            if (!sent){
                console.log('Query sending error: '+self.pq.errorMessage());
                return self.raiseError(self.pq.errorMessage());
            }



            self.pq.startReader();
        });
    };


    // query is ready to return data, so read data from server
    this.readyHandler = function(){
        while (!self.finished){
            self._read();
        }

        if (!self.error){
            self.finished = true;
            self.pq.removeListener('readable', self.readyHandler);
            self.pq.stopReader();
            self.callback(self.Responce);
        }
    }
    // extract data from server
    this._read = function(){
        
        self.pq.consumeInput();

        if (self.pq.isBusy()){
            return;
        } 

        res = self.pq.getResult();

        if (!res){ // no more result sets
            this.finished = true;
            return;
        }

        var nrows = self.pq.ntuples();
        var nfields = self.pq.nfields();
        var fields = [];
        for (i = 0; i<nfields; i++){
            fields.push({
                name: self.pq.fname(i),
                type: self.pq.ftype(i),
            });
        }
        var records = [];
        for (r = 0; r < nrows; r++){
            rec = [];
            for (f = 0; f < nfields; f++){
                if (self.pq.getisnull(r, f)){
                    v = null;
                } else {
                    v = self.pq.getvalue(r, f);
                }
                rec.push(v);
            }
            records.push(rec);
        }

        self.Responce.datasets.push({
            nrecords: nrows, 
            fields: fields, 
            data: records, 
            cmdStatus: self.pq.cmdStatus(),
            resultStatus: self.pq.resultStatus(),
            resultErrorMessage: self.pq.resultErrorMessage(),
        });
    }
}

var Responce = function(){
    this.datasets = [];
}

// normalizes connect string
var normalizeConnstr = function(connstr){
    if (connstr){
        if (connstr.lastIndexOf('postgres://', 0) !== 0) {
            connstr = 'postgres://'+connstr
        }
        return connstr;
    }
};


module.exports = Client;